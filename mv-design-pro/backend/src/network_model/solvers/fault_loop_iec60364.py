"""
Fault Loop Impedance Solver for LV networks (IEC 60364-4-41).

Pętla zwarcia jednofazowego po stronie nN — JEDYNE wejście fizyki Ik1 nN (ADR-015).

Reference:
- IEC 60364-4-41:2017 — Protection against electric shock
- IEC 60909-0:2016 — Short-circuit currents in three-phase a.c. systems
- docs/audit/IMPLEMENTATION_GAP_ANALYSIS.md § 2.5 (Fault-loop NN gap)
- docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md § 3.3

Zakres:
- TN-S, TN-C-S, TN-C — pętla L-PE/L-PEN liczona TUTAJ (jądro: ``zsumuj_skladowe_petli`` +
  ``prad_z_petli``).
- TT, IT — dyspozycja po ``network_type`` do ``network_model.solvers.petla_zwarcia_tt_it``
  (karta W5-E-TTIT, decyzje OD-25 + D-11 + O-68): pętla doziemna przez uziomy R_A/R_B (TT),
  pierwsze zwarcie pojemnościowe i drugie zwarcie L-PE-L (IT). Tamten moduł używa TEGO
  SAMEGO jądra sumowania i prądu — jedna fizyka pętli, bez drugiej kopii.
- Pojedynczy punkt zwarcia (jeden bus LV); wołający dostarcza składowe (R+X) z trasy,
  transformatora i sieci zasilającej (``fault_loop_builder``, ``application/analyses/fault_loop``).

Co solver NIE robi:
- Multi-transformer parallel — wołający liczy od transformatora własnej sekcji
  (``application/analyses/fault_loop/service.py``).
- Dynamic device behavior (RCD, MZO time-current curves) — read-only consumption
  (solver liczy wielkości pętli; werdykt czasu wyłączenia jest w warstwie interpretacji).

INVARIANTS:
- No heuristics (per V12.xx canon — patrz scripts/load_flow_no_heuristics_guard.py)
- Deterministyczne (same input → identical output)
- WHITE BOX trace dla każdego kroku
- Frozen dataclasses
- Polskie etykiety w komunikatach błędów
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from enum import StrEnum
from typing import TYPE_CHECKING, Any

from network_model.core.voltage_factor import (
    TolerancjaNapieciaNn,
    c_for_node,
    zrodlo_c_z_tabeli,
)
from network_model.odmowa_danych import OdmowaDanychError

if TYPE_CHECKING:
    from network_model.solvers.petla_zwarcia_tt_it import DaneTtIt, WynikTtIt

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


class NetworkType(StrEnum):
    """Typ uziemienia sieci nN per IEC 60364-3."""

    TN_S = "TN-S"  # Separate neutral + protective conductors
    TN_C_S = "TN-C-S"  # Combined PEN, separated near load (typowy dla osiedli mieszkalnych w PL)
    TN_C = "TN-C"  # Combined PEN cały sposób (deprecated, ale legacy)
    TT = "TT"  # Separate earthing (deferred)
    IT = "IT"  # Isolated neutral (deferred)


class ProtectionArrangement(StrEnum):
    """Sposób ochrony przed dotykiem pośrednim."""

    PE = "PE"  # Oddzielny przewód ochronny (TN-S)
    PEN = "PEN"  # Łączony przewód neutralno-ochronny (TN-C-S)
    NONE = "NONE"  # Bez ochronnika (TT / IT — specific arrangements)


# Frozen impedance components (re/im in ohms)
@dataclass(frozen=True)
class LoopImpedanceComponent:
    """Impedancja składowa pętli zwarcia (Z = R + jX)."""

    label: str  # human-readable, polskie
    r_ohm: float
    x_ohm: float

    @property
    def magnitude_ohm(self) -> float:
        return math.sqrt(self.r_ohm**2 + self.x_ohm**2)

    @property
    def as_complex(self) -> complex:
        return complex(self.r_ohm, self.x_ohm)


@dataclass(frozen=True)
class FaultLoopResult:
    """
    Wynik analizy pętli zwarcia po stronie nN (IEC 60364-4-41).

    Frozen + WHITE BOX trace. Solver tylko liczy impedancje + Ik;
    decyzję o disconnection time podejmuje WARSTWA WYŻSZA (analyst lub
    protection coordination engine).
    """

    fault_node_id: str
    network_type: NetworkType
    protection_arrangement: ProtectionArrangement
    u_nom_v: float  # napięcie znamionowe fazowe [V]

    # Skladowe impedancji pętli
    components: tuple[LoopImpedanceComponent, ...]

    # Wyniki obliczeń
    z_loop_ohm: complex  # R + jX całkowite [Ω]
    ik_min_a: float  # I_k,min = c_min·U_0/|Z_s| (c_min z tabeli 1 dla tolerancji sieci nN)
    ik_max_a: float  # I_k,max = c_max·U_0/|Z_s|
    # Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: c użyte w wyniku i ich podstawa (White Box) —
    # tabela 1 IEC 60909-0, wiersz nN wg tolerancji sieci (+6 %: 1,05/0,95; +10 %: 1,10/0,90).
    c_min: float
    c_max: float
    c_zrodlo_min: str
    c_zrodlo_max: str

    # Determinizm + audyt
    white_box_trace: tuple[dict[str, Any], ...] = field(default_factory=tuple)
    # Karta TOLERANCJA-NN-WARTOSC-ROBOCZA: klasa tolerancji sieci nN pętli jest wartością
    # roboczą rejestru (nie deklaracją) — konsument werdyktu dokłada daną przyjętą. Addytywnie:
    # `to_dict` niesie klucz wyłącznie przy wartości roboczej (słowniki i odciski pętli z
    # deklaracją są bit w bit takie jak przed kartą).
    tolerancja_nn_robocza: bool = False
    # Karta W5-E-TTIT: wielkości pętli TT/IT (addytywne — `None` dla TN, to_dict bez klucza,
    # więc słowniki i odciski wyników TN są bit w bit takie jak przed kartą).
    tt_it: WynikTtIt | None = None
    # Karta LINIA-110: dane przyjęte (zapis JSON kontraktu werdyktu) linii 110 kV liczonych
    # z wartością roboczą geometrii w wyspie zasilającej transformator — impedancja sieci
    # zasilającej pętli stoi na nich. Dokłada WOŁAJĄCY (warstwa aplikacji,
    # `fault_loop.service.oblicz_petle_na_trasie`); solver ich nie czyta. Addytywnie:
    # `to_dict` niesie klucz wyłącznie, gdy niepuste.
    dane_przyjete_linii_wn: tuple[dict[str, Any], ...] = ()

    @property
    def z_loop_magnitude_ohm(self) -> float:
        return abs(self.z_loop_ohm)

    def to_dict(self) -> dict[str, Any]:
        """Serialize per V12.xx canonical pattern (complex → re/im)."""
        wynik: dict[str, Any] = {
            "fault_node_id": self.fault_node_id,
            "network_type": self.network_type.value,
            "protection_arrangement": self.protection_arrangement.value,
            "u_nom_v": self.u_nom_v,
            "components": [
                {
                    "label": c.label,
                    "r_ohm": c.r_ohm,
                    "x_ohm": c.x_ohm,
                    "magnitude_ohm": c.magnitude_ohm,
                }
                for c in self.components
            ],
            "z_loop_ohm": {
                "re": self.z_loop_ohm.real,
                "im": self.z_loop_ohm.imag,
                "magnitude": self.z_loop_magnitude_ohm,
            },
            "ik_min_a": self.ik_min_a,
            "ik_max_a": self.ik_max_a,
            "c_min": self.c_min,
            "c_max": self.c_max,
            "c_zrodlo_min": self.c_zrodlo_min,
            "c_zrodlo_max": self.c_zrodlo_max,
            "white_box_trace": list(self.white_box_trace),
        }
        if self.tolerancja_nn_robocza:
            wynik["tolerancja_nn_robocza"] = True
        if self.dane_przyjete_linii_wn:
            wynik["dane_przyjete_linii_wn"] = [dict(d) for d in self.dane_przyjete_linii_wn]
        if self.tt_it is not None:
            wynik["tt_it"] = self.tt_it.to_dict()
        return wynik


# ---------------------------------------------------------------------------
# Solver
# ---------------------------------------------------------------------------


# c per IEC 60909-0 Table 1, low-voltage (≤ 1 kV) systems — read from the ONE place of the
# table (`network_model.core.voltage_factor.c_for_node`) with the declared tolerance of the nN
# system (karta WSPOLCZYNNIK-C-JEDEN-NOSNIK); no c value lives in this module.


@dataclass(frozen=True)
class FaultLoopInput:
    """Input minimalny dla MVP — pojedyncza stacja, jeden bus LV."""

    fault_node_id: str  # bus LV gdzie zwarcie
    u_nom_v: float  # napięcie nominalne fazowe LV [V], typowo 230
    # Komponenty pętli — caller dostarcza, solver sumuje.
    # MVP: pre-computed; future: extracted z NetworkGraph
    phase_conductor: LoopImpedanceComponent  # R + jX przewodu fazowego (L)
    return_conductor: LoopImpedanceComponent  # R + jX PEN/PE
    transformer_impedance: LoopImpedanceComponent  # Z TR sprowadzony do LV
    upstream_impedance: LoopImpedanceComponent | None = None  # opcjonalna SN side
    network_type: NetworkType = NetworkType.TN_S
    protection_arrangement: ProtectionArrangement = ProtectionArrangement.PE
    # Karta W5-E-TTIT: dane pętli doziemnej TT/IT (R_A, R_B, I_Δn, pojemności, f) — wymagane
    # wyłącznie dla `network_type` TT/IT; dla TN ignorowane (musi być None).
    dane_tt_it: DaneTtIt | None = None
    # Klasa tolerancji napięcia sieci nN (wiersz nN tabeli 1 IEC 60909-0), rozstrzygnięta przez
    # wołającego: deklaracja z nośnika (`Transformer.lv_voltage_tolerance` /
    # `Source.lv_voltage_tolerance`, `enm.tolerancja_nn`) albo wartość robocza rejestru
    # (`wartosci_robocze.rozstrzygnij_tolerancje_nn`). Pole WYMAGANE (bez domyślnej);
    # nierozstrzygnięta klasa przy U_0 w paśmie nN to błąd programu wołającego.
    tolerancja_nn: TolerancjaNapieciaNn | None = field(kw_only=True)
    # Karta TOLERANCJA-NN-WARTOSC-ROBOCZA: klasa wyżej jest wartością roboczą — podstawa c
    # pętli mówi „wartość robocza", wynik niesie znacznik dla werdyktu.
    tolerancja_nn_robocza: bool = field(default=False, kw_only=True)


def _validate_input(data: FaultLoopInput) -> None:
    """
    Walidacja MVP — wymusza tylko bazowy sanity (no heuristics).

    AUDIT FIX #3 (observability): każdy reject loguje WHICH input failed
    + dlaczego, żeby batch executor (np. fault scan na 100 buses) mógł
    zebrać audit trail bez try/except scaffold po stronie caller'a.
    """
    if data.u_nom_v <= 0:
        logger.warning(
            "fault_loop reject: u_nom_v <= 0",
            extra={"fault_node_id": data.fault_node_id, "u_nom_v": data.u_nom_v},
        )
        raise OdmowaDanychError(
            f"u_nom_v MUSI być > 0 V, otrzymano {data.u_nom_v}. "
            "Sprawdź wejście — brak nominal voltage z NetworkGraph."
        )
    if data.network_type in (NetworkType.TT, NetworkType.IT):
        if data.dane_tt_it is None:
            logger.warning(
                "fault_loop reject: brak danych pętli TT/IT",
                extra={
                    "fault_node_id": data.fault_node_id,
                    "network_type": data.network_type.value,
                },
            )
            raise OdmowaDanychError(
                f"Układ {data.network_type.value}: pętla zwarcia doziemnego wymaga danych "
                "TT/IT (uziomy R_A/R_B i I_Δn dla TT; pojemności doziemne i częstotliwość dla "
                "IT) — brak danej nie jest zastępowany wartością."
            )
    elif data.dane_tt_it is not None:
        raise OdmowaDanychError(
            f"Układ {data.network_type.value}: dane pętli TT/IT nie mają zastosowania do pętli "
            "L-PE/L-PEN układu TN — usuń je z wejścia albo popraw układ sieci."
        )
    for label, comp in (
        ("phase_conductor", data.phase_conductor),
        ("return_conductor", data.return_conductor),
        ("transformer_impedance", data.transformer_impedance),
    ):
        if comp.r_ohm < 0 or comp.x_ohm < 0:
            logger.warning(
                "fault_loop reject: negative impedance component",
                extra={
                    "fault_node_id": data.fault_node_id,
                    "component": label,
                    "r_ohm": comp.r_ohm,
                    "x_ohm": comp.x_ohm,
                },
            )
            raise OdmowaDanychError(
                f"Składowa '{label}' ma ujemną R lub X "
                f"(R={comp.r_ohm}, X={comp.x_ohm}). "
                "Impedancje fizyczne MUSZĄ być nieujemne."
            )


def zsumuj_skladowe_petli(
    components: list[LoopImpedanceComponent],
) -> tuple[complex, dict[str, Any]]:
    """Jądro pętli, krok 1: Z_loop = Σ(R_i + jX_i) — wspólne dla TN i TT/IT (jedna fizyka).

    Zwraca impedancję zespoloną i krok śladu WHITE BOX. Kolejność działań identyczna z
    dotychczasowym ``compute_fault_loop`` (suma zespolona od ``complex(0, 0)``), więc wyniki
    TN są bit w bit takie same jak przed wydzieleniem (test tożsamości
    ``tests/test_petla_tn_tozsamosc_w5e_ttit.py``).
    """
    z_loop_complex = sum(
        (c.as_complex for c in components),
        start=complex(0, 0),
    )
    krok = {
        "step": "sum_components",
        "method": "Z_loop = Σ(R_i + jX_i)",
        "components": [{"label": c.label, "r_ohm": c.r_ohm, "x_ohm": c.x_ohm} for c in components],
        "result": {
            "r_total_ohm": z_loop_complex.real,
            "x_total_ohm": z_loop_complex.imag,
            "magnitude_ohm": abs(z_loop_complex),
        },
    }
    return z_loop_complex, krok


# CR-FIX (code-review KRYTYCZNE #2): guard przeciw bardzo małemu Z.
# Z_loop < 1 µΩ jest fizycznie niemożliwe dla realnej sieci nN
# (PowerSCC dowolnego rozdzielacza ogranicza Ik do max ~100 kA).
# Bez tego guard'a ekstremalnie małe Z dawały Ik daleko poza zakresem
# IEEE 754 i nadawały overflow JSON.
Z_MIN_OHM = 1e-6


@dataclass(frozen=True)
class WspolczynnikiCPetli:
    """c_min i c_max pętli nN z podstawą (White Box) — jedna para dla TN, TT i IT."""

    c_min: float
    c_max: float
    zrodlo_min: str
    zrodlo_max: str
    #: Klasa tolerancji sieci nN jest wartością roboczą (karta TOLERANCJA-NN-WARTOSC-ROBOCZA).
    tolerancja_nn_robocza: bool = False


def wspolczynniki_c_petli(data: FaultLoopInput) -> WspolczynnikiCPetli:
    """Jedyny dobór c pętli nN: tabela 1 IEC 60909-0 (``voltage_factor``), wiersz nN wg
    klasy tolerancji sieci (``data.tolerancja_nn``: deklaracja albo wartość robocza, nazwana
    w podstawie) — dla KAŻDEGO układu (TN, TT, IT).

    Pasmo czytane z napięcia fazowego U_0 sieci (U_0 i U_n sieci 230/400 V leżą w tym samym
    paśmie nN), NIE z napięcia napędowego pętli (dla drugiego zwarcia IT jest nim U_LL/2).
    """
    u_kv = data.u_nom_v / 1000.0
    tol = data.tolerancja_nn
    robocza = data.tolerancja_nn_robocza
    return WspolczynnikiCPetli(
        c_min=c_for_node(u_kv, "MIN", tolerancja_nn=tol),
        c_max=c_for_node(u_kv, "MAX", tolerancja_nn=tol),
        zrodlo_min=zrodlo_c_z_tabeli(u_kv, "MIN", tolerancja_nn=tol, tolerancja_nn_robocza=robocza),
        zrodlo_max=zrodlo_c_z_tabeli(u_kv, "MAX", tolerancja_nn=tol, tolerancja_nn_robocza=robocza),
        tolerancja_nn_robocza=robocza,
    )


def prad_z_petli(
    *, u_v: float, z_magnitude: float, fault_node_id: str, c: WspolczynnikiCPetli
) -> tuple[float, float, dict[str, Any]]:
    """Jądro pętli, krok 2: I = c · U / |Z| dla c_min i c_max (IEC 60909-0 § 5.3.2, nN).

    ``u_v`` — napięcie napędowe pętli [V] (U_0 dla TN i TT; U_LL/2 dla drugiego zwarcia IT —
    wołający dokumentuje wybór w swoim śladzie). ``c`` — z ``wspolczynniki_c_petli`` (jedyne
    źródło c pętli). Odmowa dla |Z| poniżej ``Z_MIN_OHM``.
    """
    if z_magnitude < Z_MIN_OHM:
        logger.warning(
            "fault_loop reject: Z_loop below minimum threshold",
            extra={
                "fault_node_id": fault_node_id,
                "z_magnitude_ohm": z_magnitude,
                "z_min_ohm": Z_MIN_OHM,
            },
        )
        raise OdmowaDanychError(
            f"Z_loop = {z_magnitude:.3e} Ω < {Z_MIN_OHM:.0e} Ω — pętla zerowa lub "
            "fizycznie niemożliwa (degenerated case). Realna nN ma Z_loop "
            "≥ kilkudziesięciu mΩ. Sprawdź dane wejściowe."
        )
    ik_min = (c.c_min * u_v) / z_magnitude
    ik_max = (c.c_max * u_v) / z_magnitude
    krok = {
        "step": "compute_ik",
        "method": "I_k = c * U_n / |Z_loop|",
        "c_min": c.c_min,
        "c_max": c.c_max,
        "c_zrodlo_min": c.zrodlo_min,
        "c_zrodlo_max": c.zrodlo_max,
        "u_nom_v": u_v,
        "z_magnitude_ohm": z_magnitude,
        "ik_min_a": ik_min,
        "ik_max_a": ik_max,
    }
    return ik_min, ik_max, krok


def compute_fault_loop(data: FaultLoopInput) -> FaultLoopResult:
    """
    Oblicz impedancję pętli zwarcia + Ik per IEC 60364-4-41.

    WHITE BOX: każdy krok obliczeniowy zapisany w white_box_trace.

    Equation (IEC 60364-4-41 § 411.4.4), układ TN:
        Z_loop = Z_phase + Z_return + Z_transformer (+ Z_upstream optional)
        I_k = c * U_n / |Z_loop|

    gdzie:
        c — współczynnik napięciowy IEC 60909-0 tab. 1 dla sieci nN o zadeklarowanej
            tolerancji (+6 %: c_min 0,95, c_max 1,05; +10 %: c_min 0,90, c_max 1,10)
        U_n — napięcie fazowe [V] (typowo 230 V dla 400/230 sieci 3F4W)

    Układ TT/IT: dyspozycja po ``network_type`` do ``petla_zwarcia_tt_it`` (jedno wejście
    fizyki Ik1 nN; import lokalny, bo tamten moduł importuje jądro stąd).
    """
    _validate_input(data)
    if data.network_type in (NetworkType.TT, NetworkType.IT):
        from network_model.solvers.petla_zwarcia_tt_it import OBLICZ_WG_UKLADU

        return OBLICZ_WG_UKLADU[data.network_type](data)

    trace: list[dict[str, Any]] = []

    # Krok 1: zsumuj komponenty pętli (R i X osobno)
    components = [
        data.phase_conductor,
        data.return_conductor,
        data.transformer_impedance,
    ]
    if data.upstream_impedance is not None:
        components.append(data.upstream_impedance)

    z_loop_complex, krok_sumy = zsumuj_skladowe_petli(components)
    trace.append(krok_sumy)

    # Krok 2: oblicz Ik z c MIN/MAX (tabela 1 IEC 60909-0, wiersz nN wg tolerancji sieci).
    c = wspolczynniki_c_petli(data)
    ik_min, ik_max, krok_pradu = prad_z_petli(
        u_v=data.u_nom_v, z_magnitude=abs(z_loop_complex), fault_node_id=data.fault_node_id, c=c
    )
    trace.append(krok_pradu)

    return FaultLoopResult(
        fault_node_id=data.fault_node_id,
        network_type=data.network_type,
        protection_arrangement=data.protection_arrangement,
        u_nom_v=data.u_nom_v,
        components=tuple(components),
        z_loop_ohm=z_loop_complex,
        ik_min_a=ik_min,
        ik_max_a=ik_max,
        c_min=c.c_min,
        c_max=c.c_max,
        c_zrodlo_min=c.zrodlo_min,
        c_zrodlo_max=c.zrodlo_max,
        tolerancja_nn_robocza=c.tolerancja_nn_robocza,
        white_box_trace=tuple(trace),
    )
