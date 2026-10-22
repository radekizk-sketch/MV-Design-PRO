"""IEC 60909-0 Table 1 — voltage factor c, single shared source of truth.

Karta P0.3 (docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.3, docs/nn/D_KONTRAKT_SN_NN_V1.md §4) and
karta WSPOLCZYNNIK-C-JEDEN-NOSNIK (decyzja O-59, O-75, scalona z C-TOLERANCJA-NN): c is
selected PER FAULT-NODE VOLTAGE BAND, never per study/globally:

    band                          c_max   c_min
    <=1.0 kV (nN), tolerance +6 %  1.05    0.95
    <=1.0 kV (nN), tolerance +10 % 1.10    0.90
    >1.0 kV (SN/WN)                1.10    1.00

IEC 60909-0:2016 Table 1, footnotes: c_max 1.05 "for low-voltage systems with a tolerance of
+6 %, for example systems renamed from 380 V to 400 V"; c_max 1.10 "for low-voltage systems
with a tolerance of +10 %"; c_min 0.95 / 0.90 respectively. The tolerance is a DATUM of the
nN system (declared on the elements that feed it — ``Transformer.lv_voltage_tolerance`` of
an SN/nN transformer, ``Source.lv_voltage_tolerance`` of a grid source connected directly to an
nN bus — resolved per nN node by ``enm.tolerancja_nn``). Karta TOLERANCJA-NN-WARTOSC-ROBOCZA
(zasada nr 4, V12K-351): a missing or contradictory declaration does NOT block the calculation
— the working-value register (``network_model.catalog.wartosci_robocze``) proposes the +10 %
class (c_max 1.10 / c_min 0.90: the largest I_k,max and the smallest I_k,min, the safe side of
both breaking capacity and automatic disconnection), the caller resolves it and marks the c
basis as a working value (``tolerancja_nn_robocza``). This module never chooses the class: an
nN node reaching ``c_for_node`` without a resolved class is a PROGRAM error (``ValueError``),
not a silent row and not a domain refusal.

The band boundary itself is NOT encoded here: IEC 60909-0 Table 1 defines "low voltage" by
reference to IEC 60038 Table 1 (100 V to 1 000 V inclusive), i.e. the same nN band as the rest
of the product, so the selection uses the single band source
``network_model.pochodne.pasma_napieciowe.pasmo_napieciowe``. A node whose nominal voltage lies
in no band (missing, non-finite, zero or negative) is REFUSED with a named error.

This module is the ONE place that encodes the c values of the table AND the one place that
decides which c a fault node gets: the fault scenario (MAX/MIN switch) is the only carrier of
the column, the nN tolerance the only carrier of the nN row; a manual override exists only with
a written justification (``NadpisanieC``) and every choice carries its White Box basis
(``DoborC.zrodlo``: "IEC 60909-0 tab. 1, pasmo nN, tolerancja +10 %, MAX" or "nadpisanie
ręczne: <why>"). ``TransformerBranch.get_voltage_factor_c_max`` (K_T, eq. 12a),
``SynchronousMachineSource.k_g`` (K_G, eq. 18), the grid feeder impedance Z_Q (eq. 6,
``enm.mapping``) and the fault-loop solver (IEC 60364) read c from here; no other module may
hold a c value (pinned by ``tests/network_model/test_wspolczynnik_c_inwentarz.py``).

NOT a solver: pure lookup, no physics computation, no network state.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Literal

from network_model.odmowa_danych import OdmowaDanychError, OdmowaNazwana
from network_model.pochodne.pasma_napieciowe import pasmo_napieciowe

Scenario = Literal["MAX", "MIN"]

#: Tolerancja napięcia sieci nN wg przypisów tabeli 1 IEC 60909-0 (+6 % albo +10 %).
TolerancjaNapieciaNn = Literal["PLUS_6", "PLUS_10"]
TOLERANCJE_NAPIECIA_NN: tuple[TolerancjaNapieciaNn, ...] = ("PLUS_6", "PLUS_10")
#: Etykieta tolerancji w podstawie c (White Box, dowód, UI) — jedno brzmienie.
ETYKIETA_TOLERANCJI_NN: dict[str, str] = {"PLUS_6": "+6 %", "PLUS_10": "+10 %"}

#: Dopisek podstawy c, gdy klasa tolerancji sieci nN jest wartością roboczą (rejestr wartości
#: roboczych), a nie deklaracją projektanta — jedno brzmienie dla wiersza wyniku, K_G, Z_Q,
#: pętli zwarcia i dowodu.
DOPISEK_TOLERANCJI_ROBOCZEJ = "wartość robocza"

# IEC 60909-0 Table 1 (voltage factor c) — values; (c_max, c_min). Private: the ONLY way to
# read c is ``c_for_node`` / ``dobierz_c`` (no module imports a bare constant).
_TABELA_1_NN: dict[str, tuple[float, float]] = {
    "PLUS_6": (1.05, 0.95),
    "PLUS_10": (1.10, 0.90),
}
_TABELA_1_SN_WN: tuple[float, float] = (1.10, 1.00)


def c_wiersza_nn(tolerancja_nn: TolerancjaNapieciaNn) -> tuple[float, float]:
    """(c_max, c_min) wiersza nN tabeli 1 dla klasy tolerancji — odczyt tabeli, nie dobór c węzła.

    Dla opisów założeń i danych przyjętych (rejestr wartości roboczych), żeby liczby c w tekście
    pochodziły z tej samej tabeli co obliczenie.
    """
    if tolerancja_nn not in _TABELA_1_NN:
        raise ValueError(f"Klasa tolerancji sieci nN {tolerancja_nn!r} spoza tabeli 1.")
    return _TABELA_1_NN[tolerancja_nn]


def c_for_node(
    voltage_kv: float,
    scenario: Scenario,
    *,
    tolerancja_nn: TolerancjaNapieciaNn | None,
) -> float:
    """Return the IEC 60909-0 Table 1 voltage factor c for a node.

    Args:
        voltage_kv: Nominal voltage of the node [kV].
        scenario: "MAX" (for Ik''max, Ip, Ith, K_T) or "MIN" (for Ik''min).
        tolerancja_nn: RESOLVED voltage tolerance class of the nN system the node belongs to
            ("PLUS_6" / "PLUS_10" — the designer's declaration or the working value of the
            register, resolved by the caller). Required for an nN node; ignored above 1 kV
            (Table 1 has one SN/WN row).

    Returns:
        c per Table 1: nN +6 % 1.05/0.95, nN +10 % 1.10/0.90, SN/WN 1.10/1.00.

    Raises:
        OdmowaDanychError: scenario is neither "MAX" nor "MIN", or voltage_kv is not a physical
            nominal voltage (non-finite, zero or negative) — no row of Table 1 applies.
        ValueError: nN node without a resolved tolerance class (or with a value outside the
            table) — a program error of the caller, which must resolve the class
            (``enm.tolerancja_nn`` / ``wartosci_robocze.rozstrzygnij_tolerancje_nn``).
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
    if pasmo == "nN":
        if tolerancja_nn not in _TABELA_1_NN:
            raise ValueError(
                f"Węzeł nN ({voltage_kv!r} kV) bez rozstrzygniętej klasy tolerancji sieci nN "
                f"({tolerancja_nn!r}) — wołający rozstrzyga ją (deklaracja projektanta albo "
                "wartość robocza rejestru) przed doborem c."
            )
        c_max, c_min = _TABELA_1_NN[tolerancja_nn]  # type: ignore[index]
    else:
        c_max, c_min = _TABELA_1_SN_WN
    return c_max if scenario == "MAX" else c_min


# ---------------------------------------------------------------------------
# Jeden nośnik c (karta WSPOLCZYNNIK-C-JEDEN-NOSNIK, decyzja O-59)
# ---------------------------------------------------------------------------

#: Kod odmowy: nadpisanie c bez uzasadnienia (rejestr `domain.canonical_operations.READINESS_CODES`).
KOD_NADPISANIE_BEZ_UZASADNIENIA = "fault.c_nadpisanie_bez_uzasadnienia"
#: Kod odmowy: wartość nadpisania c nieliczbowa, nieskończona albo niedodatnia.
KOD_NADPISANIE_WARTOSC_NIEPOPRAWNA = "fault.c_nadpisanie_wartosc_niepoprawna"


class OdmowaNadpisaniaCError(OdmowaNazwana):
    """Nadpisanie c odrzucone — odmowa nazwana z kodem rejestru gotowości w polu ``kod``.

    Postać strukturalna partii integracji 10: kod nie stoi w treści zdania (handler 422
    przenosi ``kod`` i ``dane`` do ciała odpowiedzi obok ``detail``).
    """

    def __init__(
        self, kod: str, komunikat_pl: str, *, dane: dict[str, object] | None = None
    ) -> None:
        super().__init__(komunikat_pl, kod=kod, dane=dane)
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
            "Nadpisanie współczynnika c musi być obiektem z dokładnie dwoma polami: wartością "
            "i uzasadnieniem.",
            dane=(
                {"otrzymane_pola": tuple(sorted(str(klucz) for klucz in dane))}
                if isinstance(dane, dict)
                else {"otrzymany_typ": type(dane).__name__}
            ),
        )
    return NadpisanieC(wartosc=dane["wartosc"], uzasadnienie=dane["uzasadnienie"])


@dataclass(frozen=True)
class DoborC:
    """Wynik doboru c dla jednego węzła zwarcia: wartość i jej podstawa (White Box)."""

    wartosc: float
    zrodlo: str


def zrodlo_c_z_tabeli(
    voltage_kv: float,
    scenario: Scenario,
    *,
    tolerancja_nn: TolerancjaNapieciaNn | None,
    tolerancja_nn_robocza: bool = False,
) -> str:
    """Podstawa c z tabeli 1 dla węzła — brzmienie jedyne dla wiersza wyniku i dowodu.

    ``tolerancja_nn_robocza`` — klasa tolerancji sieci nN jest wartością roboczą rejestru, nie
    deklaracją projektanta: podstawa mówi to wprost (zasada nr 4: wynik na założeniu nie
    udaje danej). Poza pasmem nN bez znaczenia (jeden wiersz SN/WN).
    """
    # ta sama kontrola co dobór wartości (pasmo, scenariusz, klasa tolerancji nN)
    c_for_node(voltage_kv, scenario, tolerancja_nn=tolerancja_nn)
    pasmo = pasmo_napieciowe(voltage_kv)
    if pasmo == "nN":
        etykieta = ETYKIETA_TOLERANCJI_NN[str(tolerancja_nn)]
        dopisek = f" ({DOPISEK_TOLERANCJI_ROBOCZEJ})" if tolerancja_nn_robocza else ""
        return f"IEC 60909-0 tab. 1, pasmo nN, tolerancja {etykieta}{dopisek}, {scenario}"
    return f"IEC 60909-0 tab. 1, pasmo {pasmo}, {scenario}"


def dobierz_c(
    voltage_kv: float,
    scenario: Scenario,
    nadpisanie: NadpisanieC | None,
    *,
    tolerancja_nn: TolerancjaNapieciaNn | None,
    tolerancja_nn_robocza: bool = False,
) -> DoborC:
    """JEDYNA reguła wyboru c dla węzła zwarcia.

    Bez nadpisania: tabela 1 IEC 60909-0 dla pasma napięcia WŁASNEGO węzła, klasy tolerancji
    sieci nN (węzeł nN; ``tolerancja_nn_robocza`` oznacza w podstawie wartość roboczą) i
    scenariusza (MAX/MIN). Z nadpisaniem: wartość inżyniera z jego uzasadnieniem w podstawie.
    Pasmo, klasa tolerancji nN i scenariusz są sprawdzane także przy nadpisaniu — jeden
    predykat wejścia dla obu gałęzi.
    """
    zrodlo_tabeli = zrodlo_c_z_tabeli(
        voltage_kv,
        scenario,
        tolerancja_nn=tolerancja_nn,
        tolerancja_nn_robocza=tolerancja_nn_robocza,
    )
    if nadpisanie is None:
        return DoborC(
            wartosc=c_for_node(voltage_kv, scenario, tolerancja_nn=tolerancja_nn),
            zrodlo=zrodlo_tabeli,
        )
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
