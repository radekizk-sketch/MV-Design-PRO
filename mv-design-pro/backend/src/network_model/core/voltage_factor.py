"""IEC 60909-0 Table 1 — voltage factor c, single shared source of truth.

Karta P0.3 (docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.3, docs/nn/D_KONTRAKT_SN_NN_V1.md §4):
c is selected PER FAULT-NODE VOLTAGE BAND, never per study/globally:

    band            c_max   c_min
    <=1.0 kV (nN)   1.05    0.95
    >1.0 kV (SN/WN) 1.10    1.00

The band boundary itself is NOT encoded here: IEC 60909-0 Table 1 defines "low
voltage" by reference to IEC 60038 Table 1 (100 V to 1 000 V inclusive), i.e. the
same nN band as the rest of the product, so the selection uses the single band
source ``network_model.pochodne.pasma_napieciowe.pasmo_napieciowe``. A node whose nominal
voltage lies in no band (missing, non-finite, zero or negative) is REFUSED with a named
error: Table 1 has no row for it, and silently taking the low-voltage row (the behaviour
before 2026-09-25) was a guess that turned invalid input into a plausible-looking c.

This module is the ONE place that encodes the c values of the table AND the one place that
decides which c a fault node gets (karta WSPOLCZYNNIK-C-JEDEN-NOSNIK, decyzja O-59): the
fault scenario (MAX/MIN switch) is the only carrier of c; a manual override exists only
with a written justification (``NadpisanieC``) and every choice carries its White Box basis
(``DoborC.zrodlo``: "IEC 60909-0 tab. 1, pasmo SN, MAX" or "nadpisanie ręczne: <why>").

This module is the ONE place that encodes the c values of the table. ``TransformerBranch.
get_voltage_factor_c_max``/``get_voltage_factor_c_min`` (network_model/core/
branch.py) delegate here instead of duplicating the thresholds, and the canonical
short-circuit assembler (``enm/assembler.py::zloz_wejscie_zwarcia``) uses ``c_for_node``
directly to pick c for the actual short-circuit fault node.

NOT a solver: pure lookup, no physics computation, no network state.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Literal

from network_model.odmowa_danych import OdmowaDanychError
from network_model.pochodne.pasma_napieciowe import pasmo_napieciowe

Scenario = Literal["MAX", "MIN"]

# IEC 60909-0 Table 1 (voltage factor c) — values.
LV_C_MAX = 1.05  # <=1.0 kV (nN, e.g. 230/400 V systems, tolerance +6 %)
LV_C_MIN = 0.95
MV_HV_C_MAX = 1.10  # >1.0 kV (SN/WN)
MV_HV_C_MIN = 1.00


def c_for_node(voltage_kv: float, scenario: Scenario) -> float:
    """Return the IEC 60909-0 Table 1 voltage factor c for a node.

    Args:
        voltage_kv: Nominal voltage of the node [kV].
        scenario: "MAX" (for Ik''max, Ip, Ith) or "MIN" (for Ik''min).

    Returns:
        c per Table 1: 1.05/0.95 for voltage_kv <= 1.0 kV, else 1.10/1.00.

    Raises:
        ValueError: scenario is neither "MAX" nor "MIN", or voltage_kv is not a physical
            nominal voltage (non-finite, zero or negative) — no row of Table 1 applies.
    """
    if scenario not in ("MAX", "MIN"):
        raise OdmowaDanychError(
            f"Nieznany scenariusz współczynnika c: {scenario!r} (oczekiwano MAX/MIN)"
        )
    pasmo = pasmo_napieciowe(voltage_kv)
    if pasmo is None:
        raise OdmowaDanychError(
            f"Napięcie znamionowe {voltage_kv!r} kV nie leży w żadnym paśmie napięć — "
            "współczynnika napięciowego c (IEC 60909-0, tabela 1) nie da się dobrać."
        )
    if scenario == "MAX":
        return LV_C_MAX if pasmo == "nN" else MV_HV_C_MAX
    return LV_C_MIN if pasmo == "nN" else MV_HV_C_MIN


# ---------------------------------------------------------------------------
# Jeden nośnik c (karta WSPOLCZYNNIK-C-JEDEN-NOSNIK, decyzja O-59)
# ---------------------------------------------------------------------------

#: Kod odmowy: nadpisanie c bez uzasadnienia (rejestr `domain.canonical_operations.READINESS_CODES`).
KOD_NADPISANIE_BEZ_UZASADNIENIA = "fault.c_nadpisanie_bez_uzasadnienia"
#: Kod odmowy: wartość nadpisania c nieliczbowa, nieskończona albo niedodatnia.
KOD_NADPISANIE_WARTOSC_NIEPOPRAWNA = "fault.c_nadpisanie_wartosc_niepoprawna"


class OdmowaNadpisaniaCError(OdmowaDanychError):
    """Nadpisanie c odrzucone — niesie kod rejestru gotowości (``kod``) i komunikat PL."""

    def __init__(self, kod: str, komunikat_pl: str) -> None:
        super().__init__(f"{kod}: {komunikat_pl}")
        self.kod = kod
        self.komunikat_pl = komunikat_pl


@dataclass(frozen=True)
class NadpisanieC:
    """Ręczne nadpisanie współczynnika c — wartość RAZEM z uzasadnieniem inżyniera.

    IEC 60909-0 dopuszcza c spoza tabeli 1 wyłącznie z konkretnego powodu (np. uzgodnienie
    z operatorem, ograniczenie c·U_n ≤ U_m). Obiektu nie da się zbudować bez uzasadnienia
    ani z wartością niefizyczną — jedyną drogą jest ``nadpisanie_c_z_danych``.
    """

    wartosc: float
    uzasadnienie: str

    def __post_init__(self) -> None:
        if isinstance(self.wartosc, bool) or not isinstance(self.wartosc, int | float):
            raise OdmowaNadpisaniaCError(
                KOD_NADPISANIE_WARTOSC_NIEPOPRAWNA,
                f"Wartość nadpisania współczynnika c {self.wartosc!r} nie jest liczbą.",
            )
        if not math.isfinite(float(self.wartosc)) or float(self.wartosc) <= 0.0:
            raise OdmowaNadpisaniaCError(
                KOD_NADPISANIE_WARTOSC_NIEPOPRAWNA,
                f"Wartość nadpisania współczynnika c {self.wartosc!r} musi być skończoną "
                "liczbą dodatnią.",
            )
        if not isinstance(self.uzasadnienie, str) or not self.uzasadnienie.strip():
            raise OdmowaNadpisaniaCError(
                KOD_NADPISANIE_BEZ_UZASADNIENIA,
                "Nadpisanie współczynnika napięciowego c wymaga uzasadnienia — IEC 60909-0 "
                "dopuszcza wartość spoza tabeli 1 tylko z konkretnego powodu (np. uzgodnienie "
                "z operatorem, ograniczenie c·Un ≤ Um).",
            )

    def to_dict(self) -> dict[str, Any]:
        return {"wartosc": float(self.wartosc), "uzasadnienie": self.uzasadnienie.strip()}


def nadpisanie_c_z_danych(dane: Any) -> NadpisanieC | None:
    """Nadpisanie c z danych kontraktu (opcje biegu, konfiguracja scenariusza, żądanie API).

    ``None`` = brak nadpisania (c z tabeli 1 per węzeł). Słownik musi nieść DOKŁADNIE
    ``wartosc`` i ``uzasadnienie``; każdy inny kształt jest odmową z kodem.
    """
    if dane is None:
        return None
    if isinstance(dane, NadpisanieC):
        return dane
    if not isinstance(dane, dict) or set(dane) != {"wartosc", "uzasadnienie"}:
        raise OdmowaNadpisaniaCError(
            KOD_NADPISANIE_WARTOSC_NIEPOPRAWNA,
            "Nadpisanie współczynnika c musi być obiektem {wartosc, uzasadnienie}; "
            f"otrzymano {dane!r}.",
        )
    return NadpisanieC(wartosc=dane["wartosc"], uzasadnienie=dane["uzasadnienie"])


@dataclass(frozen=True)
class DoborC:
    """Wynik doboru c dla jednego węzła zwarcia: wartość i jej podstawa (White Box)."""

    wartosc: float
    zrodlo: str


def zrodlo_c_z_tabeli(voltage_kv: float, scenario: Scenario) -> str:
    """Podstawa c z tabeli 1 dla węzła — brzmienie jedyne dla wiersza wyniku i dowodu."""
    c_for_node(voltage_kv, scenario)  # ta sama odmowa co dobór wartości (pasmo, scenariusz)
    return f"IEC 60909-0 tab. 1, pasmo {pasmo_napieciowe(voltage_kv)}, {scenario}"


def dobierz_c(voltage_kv: float, scenario: Scenario, nadpisanie: NadpisanieC | None) -> DoborC:
    """JEDYNA reguła wyboru c dla węzła zwarcia.

    Bez nadpisania: tabela 1 IEC 60909-0 dla pasma napięcia WŁASNEGO węzła i scenariusza
    (MAX/MIN). Z nadpisaniem: wartość inżyniera z jego uzasadnieniem w podstawie. Pasmo
    i scenariusz są sprawdzane także przy nadpisaniu — węzeł bez pasma albo nieznany
    scenariusz to odmowa niezależnie od trybu (jeden predykat wejścia dla obu gałęzi).
    """
    zrodlo_tabeli = zrodlo_c_z_tabeli(voltage_kv, scenario)
    if nadpisanie is None:
        return DoborC(wartosc=c_for_node(voltage_kv, scenario), zrodlo=zrodlo_tabeli)
    return DoborC(
        wartosc=float(nadpisanie.wartosc),
        zrodlo=f"nadpisanie ręczne: {nadpisanie.uzasadnienie.strip()}",
    )


def opis_c_biegu(nadpisanie: NadpisanieC | None) -> dict[str, Any]:
    """Projekcja trybu c biegu dla odpowiedzi API i proweniencji — JEDEN kształt.

    ``auto_per_wezel`` (c z tabeli 1 dla pasma każdego węzła, podstawa w wierszu wyniku)
    albo ``nadpisanie`` z wartością i uzasadnieniem.
    """
    if nadpisanie is None:
        return {"tryb": "auto_per_wezel", "wartosc": None, "uzasadnienie": None}
    return {"tryb": "nadpisanie", **nadpisanie.to_dict()}
