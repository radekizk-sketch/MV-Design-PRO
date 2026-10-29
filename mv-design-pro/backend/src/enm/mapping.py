"""
Deterministic mapping: EnergyNetworkModel → NetworkGraph.

Rules:
1. Sort all elements by ref_id for determinism.
2. Bus → Node (voltage_kv, SLACK for source bus, PQ for load buses).
3. OverheadLine/Cable → LineBranch (R_total=r*l, X_total=x*l, B_total=b*l).
4. Transformer → TransformerBranch (sn, uhv, ulv, uk%, pk).
5. Source bus → SLACK node with voltage magnitude 1.0 pu.
6. SwitchBranch(status=open) → excluded from topology (Switch with state OPEN).
7. FuseBranch → LineBranch with near-zero impedance.
8. Load/Generator → adjustments on node P/Q.
9. Zero-sequence fields are mapped only by the explicit Z0 helper; they do not
   change the positive-sequence graph used by 3F calculations.
"""

from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from typing import Any

import numpy as np
from network_model.catalog.types import ConverterKind
from network_model.catalog.wartosci_robocze import (
    OPISY_PARAMETROW_MASZYNY,
    PARAMETR_BATERII_UKLAD,
    PARAMETR_COS_PHI_MASZYNY,
    PARAMETR_KROTNOSC_I_LR,
    PARAMETR_MOC_POZORNA_MASZYNY,
    PARAMETR_MOC_ZNAMIONOWA_MASZYNY,
    PARAMETR_PARY_BIEGUNOW,
    PARAMETR_SPRAWNOSC,
    PARAMETR_XD,
    PARY_BIEGUNOW_MAX,
    RODZINA_MASZYNA_ASYNCHRONICZNA,
    RODZINA_MASZYNA_SYNCHRONICZNA,
    RODZINA_MASZYNY_WG_GEN_TYPE,
    WIELKOSC_TYLKO_IB,
    WIELKOSCI_ZWARCIOWE,
    WartoscRozstrzygnieta,
    moc_pozorna_tabliczki_maszyny_mva,
    moc_znamionowa_z_mocy_pozornej,
    rozstrzygnij_parametry_maszyny,
    wartosci_projektanta_maszyny,
    wpis_parametru_maszyny,
)
from network_model.core.bateria_kondensatorow import (
    NAZWY_UKLADOW_POLACZEN_BATERII_PL,
    PODSTAWA_SKLADOWA_ZEROWA_BATERII_PL,
)
from network_model.core.branch import (
    BranchType,
    LineBranch,
    LineDropCompensation,
    TapChanger,
    TransformerBranch,
)
from network_model.core.graph import NetworkGraph
from network_model.core.grid_source import GridShortCircuitSource
from network_model.core.inverter import InverterSource
from network_model.core.machine import (
    AsynchronousMachineSource,
    SynchronousMachineSource,
)
from network_model.core.node import Node, NodeType
from network_model.core.switch import Switch, SwitchState, SwitchType
from network_model.core.uziemienie import ETYKIETA_PL_WARIANTU_UZIEMIENIA, StanAwsc
from network_model.core.voltage_factor import (
    Scenario,
    TolerancjaNapieciaNn,
    c_for_node,
    zrodlo_c_z_tabeli,
)
from network_model.core.wklad_zwarciowy_przeksztaltnika import (
    K_SC_ZRODLO_DEKLARACJA,
    K_SC_ZRODLO_NIEPOPRAWNE,
    K_SC_ZRODLO_POZA_DZIEDZINA,
    K_SC_ZRODLO_PRAD_NIEPOPRAWNY,
)
from network_model.core.ybus import S_BASE_MVA, AdmittanceMatrixBuilder
from network_model.odmowa_danych import OdmowaDanychError, OdmowaNazwana
from network_model.pochodne import (
    impedancja_z_napiecia_i_mocy_ohm,
    ka_na_a,
    kv_na_v,
    moc_pozorna_z_czynnej_mva,
    moc_zwarciowa_z_pradu_mva,
    prad_znamionowy_a,
    simens_na_mikrosimens,
)
from network_model.pochodne.pasma_napieciowe import powyzej_pasma_nn
from network_model.solvers.power_flow_zip import (
    ZipCoeffs,
    aggregate_zip,
    zip_coeffs_from_materialized_params,
)
from werdykt.kontrakt import WyjasnienieWerdyktu

from .bateria_kondensatorow import admitancja_baterii, ma_droge_zerowa, parametry_baterii
from .models import (
    Cable,
    EnergyNetworkModel,
    FuseBranch,
    Generator,
    OverheadLine,
    Source,
    SwitchBranch,
    liczba_jednostek_zrodla,
    liczba_torow,
)
from .models import TapChanger as EnmTapChanger
from .nazwy_elementow import nazwa_elementu
from .skladowa_zerowa_galezi import skladowa_zerowa_galezi
from .slownik_komunikatow import opis_elementu, opis_obiektu
from .tolerancja_nn import WyspaNn, wyspy_wezlow_nn
from .zrodlo_zwarcie import KOD_SK_MIN_BRAK, TrybDanych, dodatnia, tryb_danych

#: Kody odmów nazwanych mapowania ENM → graf (identyfikatory w `dane`, nigdy w treści —
#: partia integracji 10).
KOD_DWA_GENERATORY_REGULACJI_NAPIECIA = "mapping.dwa_generatory_regulacji_napiecia"
KOD_SZYNA_BILANSUJACA_Z_REGULACJA_NAPIECIA = "mapping.szyna_bilansujaca_z_regulacja_napiecia"


def _odmowa_zrodla_bez_szyny(source_ref: str, bus_ref: str) -> str:
    """Odmowa assemblera dla źródła wskazującego nieistniejącą szynę (odbiór CV-3.3-B).

    Do tej karty oba miejsca składania źródeł (Z_Q składowej zgodnej i Y0)
    POMIJAŁY takie źródło cichym `continue` — sieć liczyła się bez zasilania,
    bez śladu i bez kodu gotowości (klasa cichych podstawień A6-12). Walidator
    ENM zgłasza to jako BLOKADĘ `sources.bus_missing` (kanon
    `source.connection_missing`); assembler odmawia z nazwą, gdyby ktoś ominął
    walidację.
    """
    return (
        f"Źródło '{source_ref}' wskazuje nieistniejącą szynę '{bus_ref}' — "
        "walidator ENM zgłasza `sources.bus_missing`; assembler nie pomija źródeł po cichu."
    )


def _odmowa_zerowej_impedancji_z0(element_pl: str) -> str:
    """Odmowa dla zerowej impedancji składowej zerowej elementu (Y0 = 1/Z0 nie istnieje).

    Dawniej goły `ZeroDivisionError` z angielskim tekstem (bez nazwy elementu, 500 w API).
    Zerowe R0 i X0 to stan danych, który projektant poprawia w modelu — stąd nazwana
    odmowa danych z nazwą elementu.
    """
    return (
        f"{element_pl}: impedancja składowej zerowej Z0 jest równa zeru — admitancji Y0 = 1/Z0 "
        "nie da się wyznaczyć. Podaj niezerową rezystancję lub reaktancję zerową (R0, X0)."
    )


def _odmowa_elementu_bez_szyny(rodzaj: str, ref_id: str, bus_ref: str) -> str:
    """Odmowa assemblera dla elementu wskazujacego nieistniejaca szyne.

    TA SAMA KLASA, CO `_odmowa_zrodla_bez_szyny` — domknieta do konca (pomiar
    2026-09-18, karta W6-3B). Odmowa dla ZRODLA istniala od CV-3.3-B, ale
    galezie, transformatory i wytworcy byly nadal pomijane cichym `continue` w
    PIECIU miejscach tego modulu. Skutek jest gorszy niz brak elementu: rozplyw i
    zwarcia licza SIEC INNA NIZ ZAPISANA, bez sladu w wyniku i bez kodu
    gotowosci. Walidator ENM tego stanu nie blokuje (`enm/validator` nie ma
    reguly dla wiszacej referencji galezi), wiec assembler jest tu ostatnim
    miejscem, ktore moze powiedziec prawde.
    """
    return (
        f"{rodzaj} '{ref_id}' wskazuje nieistniejącą szynę '{bus_ref}' — "
        "assembler nie pomija elementów po cichu, bo bieg liczyłby sieć inną niż zapisana."
    )


def ref_to_graph_id(ref_id: str) -> str:
    """Identyfikator elementu w grafie domenowym dla ``ref_id`` modelu ENM.

    Publiczne wejscie do TEGO SAMEGO przelozenia, ktorego uzywa mapowanie modelu
    na graf. Potrzebne warstwie analiz, ktora wiaze wpisy modelu odwolujace sie do
    ``ref_id`` (np. ``ProtectionAssignment.breaker_ref``) z elementami grafu — bez
    tego kazdy konsument powielalby regule identyfikatorow i rozjechalby sie z
    mapowaniem przy pierwszej jej zmianie.
    """
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, ref_id))


# Alias historyczny uzywany wewnatrz tego modulu (jedna implementacja powyzej).
_ref_to_uuid = ref_to_graph_id


def grid_source_graph_id(source_ref_id: str) -> str:
    """Identyfikator zasilania systemowego (``GridShortCircuitSource``) w grafie domenowym.

    JEDNA regula dla mapowania modelu na graf (``add_grid_sc_source`` nizej) i dla projekcji
    wyniku, ktora wiaze wpis rdzenia (``source_id`` wkladu zrodla, karta WKLAD-ZRODLA)
    z ``ref_id`` zrodla modelu ENM — bez drugiej kopii przedrostka.
    """
    return ref_to_graph_id(f"_zsrc_{source_ref_id}")


def _map_tap_changer(
    tap_changer: EnmTapChanger | None, ref_to_node_id: dict[str, str]
) -> TapChanger | None:
    """Project an ENM TapChanger onto the domain TapChanger (V12K-045).

    Resolves ``controlled_bus_ref`` (a bus ref_id) to the domain node id so the
    LF OLTC loop can read the controlled bus voltage. Returns None when absent
    (legacy behaviour preserved).
    """
    if tap_changer is None:
        return None
    ldc = tap_changer.line_drop_compensation
    return TapChanger(
        regulation_type=tap_changer.regulation_type,
        regulated_winding=tap_changer.regulated_winding,
        neutral_position=tap_changer.neutral_position,
        current_position=tap_changer.current_position,
        min_position=tap_changer.min_position,
        max_position=tap_changer.max_position,
        step_percent=tap_changer.step_percent,
        control_mode=tap_changer.control_mode,
        voltage_setpoint_kv=tap_changer.voltage_setpoint_kv,
        deadband_kv=tap_changer.deadband_kv,
        delay_seconds=tap_changer.delay_seconds,
        controlled_bus_id=(
            ref_to_node_id.get(tap_changer.controlled_bus_ref)
            if tap_changer.controlled_bus_ref is not None
            else None
        ),
        line_drop_compensation=(
            LineDropCompensation(enabled=ldc.enabled, r_ohm=ldc.r_ohm, x_ohm=ldc.x_ohm)
            if ldc is not None
            else None
        ),
        catalog_ref=tap_changer.catalog_ref,
    )


#: Typowy stosunek R_Q/X_Q zasilania systemowego wg IEC 60909-0 §3.2 (sieci
#: wysokiego napięcia). Wartość NORMOWA, nie wymyślona — stosowana wyłącznie wtedy,
#: gdy model nie niesie własnego stosunku R/X źródła. Jedno miejsce w całym module:
#: ta sama liczba stała wcześniej w DWÓCH niezależnych kopiach obliczenia
#: impedancji źródła (w tym pliku), a dwie kopie tej samej reguły rozjeżdżają się
#: przy pierwszej zmianie jednej z nich.
_IEC60909_RX_ZASILANIA_SYSTEMOWEGO = 0.1


def impedancja_zasilania_systemowego(
    *,
    ref_id: str,
    r_ohm: float | None,
    x_ohm: float | None,
    sk3_mva: float | None,
    rx_ratio: float | None,
    u_nq_kv: float,
    ik3_ka: float | None = None,
    scenario: Scenario = "MAX",
    sk3_min_mva: float | None = None,
    ik3_min_ka: float | None = None,
    rx_ratio_min: float | None = None,
    tolerancja_nn: TolerancjaNapieciaNn | None = None,
    tolerancja_nn_robocza: bool = False,
) -> tuple[complex, dict[str, Any]] | None:
    """Impedancja zgodna zasilania systemowego Z_Q [Ω] + ślad WHITE BOX wyprowadzenia.

    ``tolerancja_nn`` — klasa tolerancji sieci nN węzła Q (``enm.tolerancja_nn``); czytana
    wyłącznie dla węzła Q w paśmie nN (wiersz nN tabeli 1), dla SN/WN bez znaczenia.
    ``tolerancja_nn_robocza`` — klasa jest wartością roboczą rejestru (karta
    TOLERANCJA-NN-WARTOSC-ROBOCZA): podstawa c w śladzie mówi to wprost, a ślad niesie znacznik.

    IEC 60909-0:2016 §6.2.1 eq. (6): Z_Q = c·U_nQ / (√3·I''_kQ) = c·U_nQ²/S''_kQ —
    współczynnik napięciowy c (Tab. 1, pasmo napięcia węzła przyłączenia Q,
    ``c_for_node``) jest CZĘŚCIĄ definicji impedancji zastępczej sieci zasilającej,
    bo deklarowana przez OSD moc zwarciowa S''_kQ została policzona ze źródłem
    zastępczym c·U_nQ/√3 za tą impedancją. Bez c (stan do CV-4.3 K6, 2026-09-06)
    prąd zwarciowy w samym węźle przyłączenia wychodził c·I''_kQ — o 10 % (SN/WN)
    lub 5 % (nN) ponad wartość deklarowaną; po K6 bieg w węźle przyłączenia odtwarza
    I''_kQ dokładnie (test ``tests/enm/test_z_q_wspolczynnik_c.py``).

    Scenariusze (CV-4.3 K7, ``tests/enm/test_k7_sk_min.py``):
    - MAX: c_max(U_nQ) z S''_kQmax (albo I''_kQmax — eq. (6) zapisana prądem), R/X z
      ``rx_ratio`` albo IEC 0,1;
    - MIN z danymi MIN: c_min(U_nQ) z S''_kQmin/I''_kQmin, R/X z ``rx_ratio_min`` →
      ``rx_ratio`` → IEC 0,1; Ik''(Q, MIN) = I''_kQmin dokładnie (jak pandapower
      ``case="min"``: z = c_min·U²/s_sc_min);
    - MIN BEZ danych MIN: Z_Q = Z_Qmax (c_max, S''_kQmax) — impedancja fizyczna z jedynej
      deklarowanej danej; c_min wchodzi wyłącznie do źródła napięciowego w węźle zwarcia
      (assembler/solver), więc Ik''min(Q) = (c_min/c_max)·I''_kQmax. Literalne
      c_min·U²/S''_kQmax dałoby Ik''min(Q) = I''_kQmax. Założenie jest NIEKONSERWATYWNE
      dla czułości zabezpieczeń (prawdziwe Z_Qmin ≥ Z_Qmax) — dlatego NIGDY cicho:
      ślad niesie ``zalozenie = source.sk_min_missing`` (kod gotowości), a wykonawca
      publikuje je w ``raw_result.zalozenia``.

    Postać WARTOŚCIOWA (nie ``Source``) — CV-4.3 K1 (KLASA NIE INSTANCJA): do karty
    K2 (2026-09-09) ``application/reference_networks/computation.py::
    build_short_circuit_graph_from_enm`` potrzebował TEJ SAMEJ formuły dla źródła
    w starym dialekcie słownikowym (``sk_max_mva``/``rx_ratio`` wprost w dict);
    ten plik i całe `computation.py` skasowane kartą K2 — wrapper
    ``impedancja_zrodla_sieciowego`` (jedyny żyjący konsument dziś) podaje tu pola
    pydantic ``Source``. Jedna formuła, zero kopii — druga kopia rozjechałaby się
    przy pierwszej zmianie (dokładnie tak, jak do K6 rozjechał się most pandapower
    i mapper). Tryb danych rozstrzyga ``enm.zrodlo_zwarcie.tryb_danych``
    — TEN SAM predykat, którym walidator i gotowość sprawdzają, czy źródło jest
    policzalne (predykaty parami).

    Tryb ``r_ohm``/``x_ohm`` (impedancja jawna) = impedancja fizyczna z modelu, bez c i
    bez wariantu MIN. ``None`` znaczy „źródło nie ma z czego policzyć impedancji"
    (brak jawnego R/X, S''_kQ i I''_kQ) — wołający POMIJA takie źródło, zamiast
    wstawiać za nie liczbę.
    """
    tryb = tryb_danych(r_ohm=r_ohm, x_ohm=x_ohm, sk3_mva=sk3_mva, ik3_ka=ik3_ka)
    if tryb is None:
        return None
    if tryb is TrybDanych.IMPEDANCJA_JAWNA:
        assert r_ohm is not None and x_ohm is not None
        z_ohm = complex(r_ohm, x_ohm)
        return z_ohm, {
            "ref_id": ref_id,
            "tryb": TrybDanych.IMPEDANCJA_JAWNA.value,
            "scenariusz": scenario,
            "u_nq_kv": u_nq_kv,
            "z_q_ohm": {"re": z_ohm.real, "im": z_ohm.imag},
            "formula": (
                "Z_Q = R_Q + jX_Q (impedancja jawna z modelu, bez c; "
                "scenariusz MIN: c_min wyłącznie w źródle napięciowym)"
            ),
        }
    tryb_min = tryb_danych(sk3_mva=sk3_min_mva, ik3_ka=ik3_min_ka)
    uzyj_min = scenario == "MIN" and tryb_min is not None
    rx_wartosc: float | None
    if uzyj_min:
        assert tryb_min is not None
        tryb_uzyty = tryb_min
        c = c_for_node(u_nq_kv, "MIN", tolerancja_nn=tolerancja_nn)
        sk_deklarowane, ik_deklarowane = sk3_min_mva, ik3_min_ka
        etykieta = f"{tryb_uzyty.value}_MIN"
        if dodatnia(rx_ratio_min):
            rx_zrodlo, rx_wartosc = "MODEL_MIN", rx_ratio_min
        elif dodatnia(rx_ratio):
            rx_zrodlo, rx_wartosc = "MODEL_MAX", rx_ratio
        else:
            rx_zrodlo, rx_wartosc = (
                "IEC_60909_DOMYSLNY_0_1",
                _IEC60909_RX_ZASILANIA_SYSTEMOWEGO,
            )
    else:
        tryb_uzyty = tryb
        c = c_for_node(u_nq_kv, "MAX", tolerancja_nn=tolerancja_nn)
        sk_deklarowane, ik_deklarowane = sk3_mva, ik3_ka
        etykieta = tryb_uzyty.value if scenario == "MAX" else f"{tryb_uzyty.value}_MAX_JAKO_MIN"
        if dodatnia(rx_ratio):
            rx_zrodlo, rx_wartosc = "MODEL", rx_ratio
        else:
            rx_zrodlo, rx_wartosc = (
                "IEC_60909_DOMYSLNY_0_1",
                _IEC60909_RX_ZASILANIA_SYSTEMOWEGO,
            )
    assert rx_wartosc is not None
    rx = float(rx_wartosc)
    ik: float | None = None
    if tryb_uzyty is TrybDanych.MOC_ZWARCIOWA:
        assert sk_deklarowane is not None
        sk = float(sk_deklarowane)
    else:
        assert ik_deklarowane is not None
        ik = float(ik_deklarowane)
        sk = moc_zwarciowa_z_pradu_mva(kv_na_v(u_nq_kv), ka_na_a(ik))
    z_abs = c * impedancja_z_napiecia_i_mocy_ohm(u_nq_kv, sk)
    x_q_ohm = z_abs / math.sqrt(1.0 + rx**2)
    r_q_ohm = x_q_ohm * rx
    z_ohm = complex(r_q_ohm, x_q_ohm)
    slad: dict[str, Any] = {
        "ref_id": ref_id,
        "tryb": etykieta,
        "scenariusz": scenario,
        "u_nq_kv": u_nq_kv,
        "sk3_mva": sk,
        **({"ik3_ka": ik} if ik is not None else {}),
        "c": c,
        "pasmo_c": "SN/WN" if powyzej_pasma_nn(u_nq_kv) else "nN",
        "c_zrodlo": zrodlo_c_z_tabeli(
            u_nq_kv,
            "MIN" if uzyj_min else "MAX",
            tolerancja_nn=tolerancja_nn,
            tolerancja_nn_robocza=tolerancja_nn_robocza,
        ),
        "rx_ratio": rx,
        "rx_ratio_zrodlo": rx_zrodlo,
        "z_q_abs_ohm": z_abs,
        "z_q_ohm": {"re": z_ohm.real, "im": z_ohm.imag},
        "formula": (
            ("Z_Q = c·U_nQ/(√3·I''_kQ)" if ik is not None else "Z_Q = c·U_nQ²/S''_kQ")
            + " (IEC 60909-0:2016 §6.2.1 eq. 6; c = "
            + ("c_min" if uzyj_min else "c_max")
            + "); X_Q = Z_Q/√(1+(R/X)²); R_Q = X_Q·(R/X)"
        ),
    }
    if tolerancja_nn_robocza and not powyzej_pasma_nn(u_nq_kv):
        slad["tolerancja_nn_robocza"] = True
    if scenario == "MIN" and not uzyj_min:
        slad["zalozenie"] = KOD_SK_MIN_BRAK
        slad["zalozenie_opis"] = (
            "Brak S''_kQmin/I''_kQmin: Z_Q z danych MAX (c_max, S''_kQmax), c_min tylko w "
            "źródle napięciowym — Ik''min(Q) = (c_min/c_max)·I''_kQmax; założenie "
            "niekonserwatywne dla czułości zabezpieczeń (Z_Qmin ≥ Z_Qmax)."
        )
    return z_ohm, slad


def impedancja_zrodla_sieciowego(
    source: Source,
    bus_voltage_kv: float,
    scenario: Scenario = "MAX",
    *,
    tolerancja_nn: TolerancjaNapieciaNn | None,
    tolerancja_nn_robocza: bool = False,
) -> tuple[complex, dict[str, Any]] | None:
    """Z_Q + ślad dla ``Source`` ENM — wrapper nad ``impedancja_zasilania_systemowego``.

    ``tolerancja_nn`` — klasa tolerancji sieci nN szyny źródła (``enm.tolerancja_nn``:
    deklaracja albo wartość robocza, ``tolerancja_nn_robocza``), jawnie podawana przez
    wołającego (``None`` poza pasmem nN)."""
    return impedancja_zasilania_systemowego(
        ref_id=source.ref_id,
        r_ohm=source.r_ohm,
        x_ohm=source.x_ohm,
        sk3_mva=source.sk3_mva,
        rx_ratio=source.rx_ratio,
        u_nq_kv=bus_voltage_kv,
        ik3_ka=source.ik3_ka,
        scenario=scenario,
        sk3_min_mva=source.sk3_min_mva,
        ik3_min_ka=source.ik3_min_ka,
        rx_ratio_min=source.rx_ratio_min,
        tolerancja_nn=tolerancja_nn,
        tolerancja_nn_robocza=tolerancja_nn_robocza,
    )


def _tolerancje_nn(wyspy_nn: dict[str, WyspaNn]) -> dict[str, TolerancjaNapieciaNn]:
    """Klasa tolerancji sieci nN per szyna nN — z jednej mapy wysp (``wyspy_wezlow_nn``)."""
    return {ref: wyspa.tolerancja for ref, wyspa in wyspy_nn.items()}


def _robocza_nn(wyspy_nn: dict[str, WyspaNn], bus_ref: str) -> bool:
    """Czy klasa tolerancji szyny jest wartością roboczą — ta sama mapa wysp co klasa."""
    wyspa = wyspy_nn.get(bus_ref)
    return wyspa is not None and wyspa.robocza


def _source_positive_impedance_ohm(
    source: Source,
    bus_voltage_kv: float,
    scenario: Scenario = "MAX",
    *,
    tolerancja_nn: TolerancjaNapieciaNn | None,
) -> complex | None:
    """Impedancja zgodna Z_Q [Ω] albo ``None`` — patrz ``impedancja_zrodla_sieciowego``."""
    wynik = impedancja_zrodla_sieciowego(
        source, bus_voltage_kv, scenario, tolerancja_nn=tolerancja_nn
    )
    return None if wynik is None else wynik[0]


def _source_zero_impedance_ohm(
    source: Source,
    bus_voltage_kv: float,
    scenario: Scenario = "MAX",
    *,
    tolerancja_nn: TolerancjaNapieciaNn | None,
) -> complex | None:
    """Z0 źródła: jawne R0/X0 (fizyczne, bez scenariusza) albo (Z0/Z1)·Z_Q(scenariusz)."""
    if source.r0_ohm is not None and source.x0_ohm is not None:
        return complex(source.r0_ohm, source.x0_ohm)
    if not dodatnia(source.z0_z1_ratio):
        return None
    assert source.z0_z1_ratio is not None
    z1 = _source_positive_impedance_ohm(
        source, bus_voltage_kv, scenario, tolerancja_nn=tolerancja_nn
    )
    if z1 is None:
        return None
    return z1 * source.z0_z1_ratio


def _add_series_admittance(
    y_bus: np.ndarray,
    *,
    from_idx: int,
    to_idx: int,
    z_ohm: complex,
    z_base_ohm: float,
) -> None:
    if from_idx == to_idx:
        return
    z_pu = z_ohm / z_base_ohm
    y_series_pu = 1.0 / z_pu
    y_bus[from_idx, to_idx] -= y_series_pu
    y_bus[to_idx, from_idx] -= y_series_pu
    y_bus[from_idx, from_idx] += y_series_pu
    y_bus[to_idx, to_idx] += y_series_pu


@dataclass(frozen=True)
class BrakWynikuZerowego:
    """Nazwana przyczyna braku wyniku składowej zerowej w węźle (karta UX-04/POLE-ZU-
    SKLADOWA-ZEROWA, §0 pkt 7): kod, przyczyna, status maszynowy ZWIĄZANY z wyjaśnieniem
    (kontrakt werdyktu wyjaśnialnego — zdanie, przyczyna, czego brakuje, zastrzeżenia).
    ``elementy`` — identyfikatory elementów modelu (dana maszynowa); zdanie niesie nazwy."""

    przyczyna: str
    kod: str
    status: str
    wyjasnienie: WyjasnienieWerdyktu
    elementy: tuple[str, ...] = ()

    @property
    def opis_pl(self) -> str:
        """Zdanie przyczyny dla projektanta (opis ograniczenia raportowego wiersza)."""
        return self.wyjasnienie.zdanie_pl

    def to_dict(self) -> dict[str, Any]:
        return {
            "przyczyna": self.przyczyna,
            "kod": self.kod,
            "status": self.status,
            "wyjasnienie": self.wyjasnienie.model_dump(mode="json"),
            "elementy": list(self.elementy),
        }


@dataclass(frozen=True)
class SiecZerowa:
    """Złożona sieć składowej zerowej: macierz Y0, ślad WHITE BOX i przyczyny braku wyniku
    zerowego per węzeł grafu (węzły składowych bez uziemienia przez małą impedancję)."""

    builder: AdmittanceMatrixBuilder
    node_index: dict[str, int]
    size: int
    y0_bus: np.ndarray
    trace: list[dict]
    przyczyny: dict[str, BrakWynikuZerowego]


#: Rodzaj bocznika składowej zerowej w węźle — klasyfikacja przyczyn braku wyniku zerowego.
#: ``rezystancyjny`` — droga przez małą impedancję z udziałem rezystancji albo bezpośrednia
#: (źródło WN/nN z Z0, uzwojenie transformatora, zespół z rezystorem / AWSC załączoną /
#: uziemieniem bezpośrednim); ``dlawik`` — zespół z samym dławikiem; ``pojemnosc`` — B0.
_BOCZNIK_REZYSTANCYJNY = "rezystancyjny"
_BOCZNIK_DLAWIK = "dlawik"
_BOCZNIK_POJEMNOSC = "pojemnosc"


def _assemble_zero_sequence_y0(
    enm: EnergyNetworkModel,
    graph: NetworkGraph,
    scenario: Scenario = "MAX",
    *,
    stan_awsc: StanAwsc = "spoczynek",
) -> SiecZerowa:
    """Składa macierz Y0 (składowej zerowej) z pól ENM + ślad WHITE BOX.

    Rozbicie po elementach (linie/kable, źródła, transformatory wg grupy
    połączeń, zespoły uziemiające) — kolejność deterministyczna (sort po ref_id).
    Transformatory stampowane wg tablicy połączeń sekwencji zerowej (SM-3, V12K-181):
    grupa wektorowa + uziemienie punktów neutralnych decydują o ciągłości /
    przerwie / boczniku do ziemi prądu zerowego. Zespoły uziemiające SN (karta
    UX-04/POLE-ZU-SKLADOWA-ZEROWA) — bocznik Z_0,TU + 3·Z_N z ``enm.uziemienie_sekcji``
    w stanie AWSC przypadku (``stan_awsc``). Źródło w paśmie SN nie wnosi Z0 (uziemienie
    sieci SN opisuje wyłącznie zespół albo uzwojenie transformatora —
    ``impedancja_zerowa_zrodla_dozwolona``).
    """
    from network_model.whitebox.tracer import WhiteBoxTracer

    tolerancje_nn = _tolerancje_nn(wyspy_wezlow_nn(enm))

    from .uziemienie_sekcji import impedancja_zerowa_zrodla_dozwolona, uziemienie_sieci
    from .zero_sequence_transformer import (
        ZeroSeqConnection,
        build_transformer_zero_seq_model,
    )

    builder = AdmittanceMatrixBuilder(graph)
    # Sieć zwarciowa składowej zgodnej: z niej bierze się mapa węzłów scalonych, na której
    # składa się Y0 — te same indeksy co w Z_1/Z_2 tego samego biegu zwarciowego.
    builder.build(siec_zwarciowa=True)
    node_index = builder.node_id_to_index
    size = len(set(node_index.values()))
    y0_bus = np.zeros((size, size), dtype=complex)
    tracer = WhiteBoxTracer()

    ref_to_node_id = {bus.ref_id: _ref_to_uuid(bus.ref_id) for bus in enm.buses}
    bus_voltage = {bus.ref_id: bus.voltage_kv for bus in enm.buses}
    # Teksty śladu nazywają szyny nazwą z modelu (karta #144), nie identyfikatorem węzła grafu.
    nazwa_szyny = {bus.ref_id: nazwa_elementu(bus, "buses") for bus in enm.buses}

    boczniki: dict[int, set[str]] = {}
    # Gałęzie w ruchu BEZ danych składowej zerowej (R′0/X′0) i bez podstawy wartości roboczej
    # (``enm.skladowa_zerowa_galezi.brak_podstawy_pl``): nie wchodzą do Y0 (zero fabrykacji),
    # ale węzeł, który odcięły od uziemienia, dostaje przyczynę ``brak_danych``.
    galezie_bez_z0: list[tuple[str, str, str]] = []
    powody_bez_z0: dict[str, str] = {}
    # Źródła spoza pasma SN (sieć 110 kV albo nN za granicą modelu) BEZ danych Z0 i bez opisu
    # „izolowany”: impedancja zerowa sieci zasilającej nieznana — nie wchodzi do Y0 (zero
    # fabrykacji), a każdy węzeł jej składowej sieci zerowej dostaje przyczynę
    # ``brak_danych`` (wynik bez bocznika źródła byłby zawyżonym Z0, nie wynikiem).
    zrodla_bez_z0: list[tuple[str, str]] = []

    for branch in sorted(enm.branches, key=lambda b: b.ref_id):
        if not isinstance(branch, OverheadLine | Cable):
            continue
        if branch.status != "closed":
            continue
        # R′0/X′0 z modelu albo wartość robocza (zasada nr 4) — ten sam predykat co bramki
        # gotowości i dane przyjęte (``enm.skladowa_zerowa_galezi``).
        skladowa = skladowa_zerowa_galezi(branch, bus_voltage.get(branch.from_bus_ref))
        if skladowa.r0_ohm_per_km is None or skladowa.x0_ohm_per_km is None:
            galezie_bez_z0.append((branch.ref_id, branch.from_bus_ref, branch.to_bus_ref))
            powody_bez_z0[branch.ref_id] = skladowa.brak_podstawy_pl or ""
            continue
        r0_ohm_per_km, x0_ohm_per_km = skladowa.r0_ohm_per_km, skladowa.x0_ohm_per_km

        from_id = ref_to_node_id.get(branch.from_bus_ref)
        to_id = ref_to_node_id.get(branch.to_bus_ref)
        if from_id is None or to_id is None:
            brakujaca = branch.from_bus_ref if from_id is None else branch.to_bus_ref
            raise OdmowaDanychError(_odmowa_elementu_bez_szyny("Galaz", branch.ref_id, brakujaca))
        if from_id not in node_index or to_id not in node_index:
            continue
        from_idx = node_index[from_id]
        to_idx = node_index[to_id]
        z0_ohm = complex(r0_ohm_per_km, x0_ohm_per_km) * branch.length_km
        if z0_ohm == 0 and from_idx != to_idx:
            raise OdmowaDanychError(
                _odmowa_zerowej_impedancji_z0(f"Gałąź {nazwa_elementu(branch, 'branches')}")
            )
        z_base_ohm = builder.get_zbase_ohm(from_id)
        _add_series_admittance(
            y0_bus,
            from_idx=from_idx,
            to_idx=to_idx,
            z_ohm=z0_ohm,
            z_base_ohm=z_base_ohm,
        )
        tracer.add(
            key=f"z0_line[{branch.ref_id}]",
            title=f"Gałąź {nazwa_elementu(branch, 'branches')}: impedancja zerowa (szeregowa)",
            formula_latex=r"Z_{0,line} = (r_0 + jx_0)\cdot \ell",
            inputs={
                "ref_id": branch.ref_id,
                "r0_ohm_per_km": r0_ohm_per_km,
                "x0_ohm_per_km": x0_ohm_per_km,
                "length_km": branch.length_km,
            },
            substitution=(
                f"Z0 = {z0_ohm.real:.6g} + j{z0_ohm.imag:.6g} Ω "
                f"(szereg {nazwa_szyny[branch.from_bus_ref]}↔{nazwa_szyny[branch.to_bus_ref]})"
            ),
            result={"z0_ohm": z0_ohm},
            notes=(
                "Wartość robocza (zasada nr 4): "
                + "; ".join(
                    f"{etykieta} = {wartosc:.6g} Ω/km — {zalozenie}"
                    for _, etykieta, zalozenie, wartosc in skladowa.robocze
                )
                + "."
                if skladowa.robocze
                else None
            ),
        )

        # Audyt fizyki fala F (V12K): pojemność doziemna linii/kabla (B0) jako
        # bocznik do ziemi w modelu π (podział /2 na każdy koniec — ten sam co
        # dla susceptancji zgodnej w `AdmittanceMatrixBuilder._get_branch_admittances_pu`).
        # Sieć zgodna i przeciwna zwarć NIE ma tej susceptancji (karta BEZ-POJEMNOSCI,
        # `ybus.PODSTAWA_POMINIECIA_ADMITANCJI_POPRZECZNYCH`: IEC 60909-0:2016 pkt 5.2 f)),
        # więc B0 tutaj jest JEDYNĄ pojemnością linii w obliczeniu zwarciowym. B0 wchodzi
        # dziś BEZWARUNKOWO; pkt 5.2 f) każe uwzględniać pojemności linii w składowej
        # zerowej w sieciach uziemionych przez małą impedancję, gdy współczynnik zwarcia
        # doziemnego > 1,4 (ustalenie właściciela 2026-10-22) — ten warunek wdroży karta
        # rdzenia ZEROWA-POJEMNOSCI; do tego czasu B0 stoi tu dla każdego sposobu
        # uziemienia punktu neutralnego.
        # Przed kartą fali F B0 było CAŁKOWICIE pomijane w sieci
        # składowej zerowej SC_1F/2F+G — dla sieci o punkcie neutralnym
        # izolowanym/skompensowanym (Petersen) ta pojemność jest DOMINUJĄCĄ
        # drogą powrotu prądu doziemnego (fizycznie: prąd pojemnościowy,
        # IEC 60909-0 / PN-EN 50522), więc jej brak fałszywie eliminował
        # jedyną realną ścieżkę I0 (macierz osobliwa lub Z0 zaniżone o brakujący
        # bocznik). ``b0_siemens_per_km`` jest już w S/km (NIE μS/km — w
        # odróżnieniu od ``b_us_per_km`` zgodnej, patrz nazwa pola i
        # v126_academic._neutral_earthing: brak przelicznika 1e-6 tamże).
        # Zero fabrykacji: gdy b0 brak, bocznik pomijany (bez zmiany, jak dla
        # r0/x0 wyżej) — NIE podstawiamy zera znaczącego fizycznie.
        if branch.b0_siemens_per_km is not None:
            y0_shunt_total_s = branch.b0_siemens_per_km * branch.length_km
            y0_shunt_total_pu = complex(0.0, y0_shunt_total_s * z_base_ohm)
            y0_shunt_per_end_pu = y0_shunt_total_pu / 2.0
            y0_bus[from_idx, from_idx] += y0_shunt_per_end_pu
            y0_bus[to_idx, to_idx] += y0_shunt_per_end_pu
            boczniki.setdefault(from_idx, set()).add(_BOCZNIK_POJEMNOSC)
            boczniki.setdefault(to_idx, set()).add(_BOCZNIK_POJEMNOSC)
            tracer.add(
                key=f"z0_line_shunt[{branch.ref_id}]",
                title=(
                    f"Gałąź {nazwa_elementu(branch, 'branches')}: pojemność doziemna "
                    "(bocznik B0, model π)"
                ),
                formula_latex=r"Y_{0,sh} = j B_0 \cdot \ell;\quad Y_{0,sh,end} = Y_{0,sh}/2",
                inputs={
                    "ref_id": branch.ref_id,
                    "b0_siemens_per_km": branch.b0_siemens_per_km,
                    "length_km": branch.length_km,
                    "z_base_ohm": z_base_ohm,
                },
                substitution=(
                    f"B0={branch.b0_siemens_per_km:.6g} S/km · {branch.length_km:.6g} km = "
                    f"{y0_shunt_total_s:.6g} S; Y0 na każdym końcu = "
                    f"j{y0_shunt_per_end_pu.imag:.6g} pu (na {nazwa_szyny[branch.from_bus_ref]} "
                    f"i {nazwa_szyny[branch.to_bus_ref]})"
                ),
                result={"y0_shunt_per_end_pu": y0_shunt_per_end_pu},
            )

    for source in sorted(enm.sources, key=lambda s: s.ref_id):
        bus_id = ref_to_node_id.get(source.bus_ref)
        if bus_id not in node_index:
            raise OdmowaDanychError(_odmowa_zrodla_bez_szyny(source.ref_id, source.bus_ref))
        # Karta FAB-D1 (D7): `bus_voltage`/`ref_to_node_id` powstają z TEGO SAMEGO
        # `enm.buses` (w. 198-199), więc szyna, która przeszła kontrolę `bus_id
        # not in node_index` wyżej, ma zawsze wpis w `bus_voltage` — sentinel
        # 0.0 nie mógł się tu wykonać ani razu. Jawny warunek (zamiast cichego
        # `.get(ref, 0.0)`) sygnalizuje ślad WHITE BOX, gdyby ten niezmiennik
        # kiedyś pękł, zamiast po cichu policzyć fizykę z zerowym napięciem.
        if source.bus_ref not in bus_voltage:
            tracer.add(
                key=f"z0_source_bus_voltage_missing[{source.ref_id}]",
                title=(
                    f"Źródło {nazwa_elementu(source, 'sources')}: pominięte w Y0 "
                    "(brak napięcia szyny)"
                ),
                formula_latex=r"\text{brak } U_n(\mathrm{bus})",
                inputs={"ref_id": source.ref_id, "bus_ref": source.bus_ref},
                substitution=(
                    "Szyna źródła nie ma zarejestrowanego napięcia znamionowego — "
                    "pominięto wkład do macierzy Y0."
                ),
                result={},
                notes="OSTRZEŻENIE: brak napięcia szyny źródła w sieci składowej zerowej.",
            )
            continue
        bus_voltage_kv = bus_voltage[source.bus_ref]
        if bus_voltage_kv <= 0:
            continue
        if not impedancja_zerowa_zrodla_dozwolona(bus_voltage_kv):
            # Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA (§0 pkt 3): źródło w paśmie SN nie opisuje
            # uziemienia sieci SN — Z0 źródła na szynie SN nie wchodzi do Y0 (walidator
            # E-W5-01 zgłasza takie dane jako sprzeczne z jedyną prawdą: zespół uziemiający
            # albo punkt neutralny uzwojenia transformatora).
            if source.r0_ohm is not None or source.x0_ohm is not None or source.z0_z1_ratio:
                tracer.add(
                    key=f"z0_source_sn_pominiete[{source.ref_id}]",
                    title=(
                        f"Źródło {nazwa_elementu(source, 'sources')}: impedancja zerowa "
                        "pominięta (szyna SN)"
                    ),
                    formula_latex=r"Y_{0,src} = 0",
                    inputs={"ref_id": source.ref_id, "bus_voltage_kv": bus_voltage_kv},
                    substitution=(
                        "Uziemienie punktu neutralnego sieci SN opisuje zespół uziemiający "
                        "albo punkt neutralny uzwojenia transformatora — nie źródło."
                    ),
                    result={},
                    notes="Z0 źródła na szynie SN nie jest drogą prądu zerowego modelu.",
                )
            continue
        # Wlasna nazwa (nie `z0_ohm` z petli galeziowej wyzej): tam wartosc jest
        # ZAWSZE zespolona, tu MOZE byc None (zrodlo bez danych skladowej zerowej).
        # Wspoldzielenie jednej nazwy chowalo te roznice przed analiza typow.
        z0_source_ohm = _source_zero_impedance_ohm(
            source, bus_voltage_kv, scenario, tolerancja_nn=tolerancje_nn.get(source.bus_ref)
        )
        if z0_source_ohm is None:
            if source.neutral_grounding is None or source.neutral_grounding.type != "isolated":
                zrodla_bez_z0.append((source.ref_id, source.bus_ref))
            continue
        if z0_source_ohm == 0:
            raise OdmowaDanychError(
                _odmowa_zerowej_impedancji_z0(f"Źródło {nazwa_elementu(source, 'sources')}")
            )
        idx = node_index[bus_id]
        y0_bus[idx, idx] += 1.0 / (z0_source_ohm / builder.get_zbase_ohm(bus_id))
        boczniki.setdefault(idx, set()).add(_BOCZNIK_REZYSTANCYJNY)
        tracer.add(
            key=f"z0_source[{source.ref_id}]",
            title=(
                f"Źródło {nazwa_elementu(source, 'sources')}: impedancja zerowa (bocznik do ziemi)"
            ),
            formula_latex=r"Y_{0,src} = 1 / (Z_{0,src}/Z_{base})",
            inputs={"ref_id": source.ref_id, "z0_ohm": z0_source_ohm},
            substitution=(
                f"Z0 źródła = {z0_source_ohm.real:.6g} + j{z0_source_ohm.imag:.6g} Ω "
                f"(bocznik do ziemi na szynie {nazwa_szyny[source.bus_ref]})"
            ),
            result={"z0_ohm": z0_source_ohm},
        )

    # Karta UX-04/POLE-BKR-MODEL: baterie kondensatorów w sieci składowej zerowej. Gwiazda
    # z uziemionym punktem gwiazdy ma każdą fazę między przewodem a ziemią, więc Y0 = Y1
    # (ta sama admitancja co w rozpływie: stopnie, straty, dławik — `admitancja_baterii`);
    # gwiazda izolowana, podwójna gwiazda izolowana i trójkąt nie mają drogi zerowej i NIE
    # stampują niczego — ślad nazywa oba przypadki z podstawą
    # (`PODSTAWA_SKLADOWA_ZEROWA_BATERII_PL`). Bateria otwarta nie wchodzi do sieci.
    for bateria in sorted(enm.shunt_capacitors, key=lambda b: b.ref_id):
        if bateria.status != "closed":
            continue
        bus_id = ref_to_node_id.get(bateria.bus_ref)
        if bus_id is None:
            raise OdmowaDanychError(
                _odmowa_elementu_bez_szyny("Bateria kondensatorów", bateria.ref_id, bateria.bus_ref)
            )
        if bus_id not in node_index:
            continue
        dane_baterii = parametry_baterii(bateria)
        uklad = str(dane_baterii[PARAMETR_BATERII_UKLAD].wartosc)
        nazwa_baterii = nazwa_elementu(bateria, "shunt_capacitors")
        if not ma_droge_zerowa(dane_baterii):
            tracer.add(
                key=f"z0_shunt_capacitor[{bateria.ref_id}]",
                title=f"Bateria {nazwa_baterii}: brak drogi zerowej",
                formula_latex=r"Y_{0,bat} = 0",
                inputs={"ref_id": bateria.ref_id, "uklad_polaczen": uklad},
                substitution=(
                    f"Układ „{NAZWY_UKLADOW_POLACZEN_BATERII_PL[uklad]}” bez połączenia z ziemią "
                    f"— brak wkładu do Y0 ({nazwa_szyny[bateria.bus_ref]})."
                ),
                result={"y0_pu": 0j},
                notes=PODSTAWA_SKLADOWA_ZEROWA_BATERII_PL,
            )
            continue
        admitancja = admitancja_baterii(
            bateria.model_dump(mode="json"),
            napiecie_bazy_kv=float(graph.nodes[bus_id].voltage_level),
            moc_bazy_mva=S_BASE_MVA,
            czestotliwosc_hz=float(enm.header.defaults.frequency_hz),
        )
        idx = node_index[bus_id]
        y0_bus[idx, idx] += admitancja.y_pu
        tracer.add(
            key=f"z0_shunt_capacitor[{bateria.ref_id}]",
            title=f"Bateria {nazwa_baterii}: admitancja zerowa (bocznik do ziemi)",
            formula_latex=r"Y_{0,bat} = Y_{1,bat} = g + jb",
            inputs={
                "ref_id": bateria.ref_id,
                "uklad_polaczen": uklad,
                "q_n_mvar": bateria.rated_mvar,
                "u_n_kv": bateria.rated_kv,
                "udzial_stopni": admitancja.zapis["udzial_stopni"],
            },
            substitution=(
                f"Układ „{NAZWY_UKLADOW_POLACZEN_BATERII_PL[uklad]}”: Y0 = "
                f"{admitancja.y_pu.real:.6g} + j{admitancja.y_pu.imag:.6g} pu "
                f"(bocznik {nazwa_szyny[bateria.bus_ref]})"
            ),
            result={"y0_pu": admitancja.y_pu},
            notes=PODSTAWA_SKLADOWA_ZEROWA_BATERII_PL,
        )

    # SM-3 (V12K-181): transformatory w sieci składowej zerowej wg grupy połączeń.
    # Przed tą kartą całkowicie pomijane — grupa wektorowa nie sterowała ścieżką
    # I0. Stamp: SERIES_THROUGH → gałąź HV↔LV; HV/LV_SHUNT_GROUND → bocznik do
    # ziemi na danym zacisku; OPEN → brak wkładu (droga zablokowana, np. trójkąt).
    transformer_trace: list[dict] = []
    # Transformatory bez grupy połączeń (W004): połączenie uzwojeń w składowej zerowej
    # nieznane — nie wchodzą do Y0 (zero zgadywania, ``build_transformer_zero_seq_model``),
    # a węzeł bez innego uziemienia po którejkolwiek stronie dostaje ``brak_danych``
    # (nie ``brak_drogi``: braku drogi nie da się stwierdzić bez grupy połączeń).
    transformatory_bez_grupy: list[tuple[str, str, str]] = []
    for trafo in sorted(enm.transformers, key=lambda t: t.ref_id):
        hv_id = ref_to_node_id.get(trafo.hv_bus_ref)
        lv_id = ref_to_node_id.get(trafo.lv_bus_ref)
        if hv_id is None or lv_id is None:
            brakujaca = trafo.hv_bus_ref if hv_id is None else trafo.lv_bus_ref
            raise OdmowaDanychError(
                _odmowa_elementu_bez_szyny("Transformator", trafo.ref_id, brakujaca)
            )
        if hv_id not in node_index or lv_id not in node_index:
            continue
        model = build_transformer_zero_seq_model(trafo)
        transformer_trace.extend(model.trace)
        if not trafo.vector_group:
            transformatory_bez_grupy.append((trafo.ref_id, trafo.hv_bus_ref, trafo.lv_bus_ref))
        if model.z0_pu is None or model.z0_pu == 0:
            continue
        y_pu = 1.0 / model.z0_pu
        if model.connection == ZeroSeqConnection.SERIES_THROUGH:
            hv_idx = node_index[hv_id]
            lv_idx = node_index[lv_id]
            if hv_idx != lv_idx:
                y0_bus[hv_idx, lv_idx] -= y_pu
                y0_bus[lv_idx, hv_idx] -= y_pu
                y0_bus[hv_idx, hv_idx] += y_pu
                y0_bus[lv_idx, lv_idx] += y_pu
        elif model.connection == ZeroSeqConnection.HV_SHUNT_GROUND:
            y0_bus[node_index[hv_id], node_index[hv_id]] += y_pu
            boczniki.setdefault(node_index[hv_id], set()).add(_BOCZNIK_REZYSTANCYJNY)
        elif model.connection == ZeroSeqConnection.LV_SHUNT_GROUND:
            y0_bus[node_index[lv_id], node_index[lv_id]] += y_pu
            boczniki.setdefault(node_index[lv_id], set()).add(_BOCZNIK_REZYSTANCYJNY)

    # Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA: zespoły uziemiające sieci SN — bocznik
    # Z_0 = Z_0,TU + 3·Z_N (IEC 60909-0: impedancja punktu neutralnego wchodzi do obwodu
    # zerowego jako 3·Z_N) z JEDYNEJ prawdy o uziemieniu sekcji (``uziemienie_sieci``).
    # Ślad niesie OBA stany AWSC (Z.13: jX w spoczynku, R‖jX po załączeniu), Y0 — stan
    # przypadku obliczeniowego.
    for sekcja in uziemienie_sieci(enm) if enm.zespoly_uziemiajace else ():
        for punkt in sekcja.punkty:
            if punkt.rodzaj != "zespol_uziemiajacy":
                continue
            zu_id = ref_to_node_id.get(punkt.bus_ref)
            if zu_id is None or zu_id not in node_index:
                continue
            z0_zu_ohm = punkt.z0_bocznika_ohm(stan_awsc)
            idx = node_index[zu_id]
            z_base_zu = builder.get_zbase_ohm(zu_id)
            z_n_spoczynek = punkt.z_n_ohm("spoczynek")
            z_n_zalaczony = punkt.z_n_ohm("zalaczony")
            tracer.add(
                key=f"z0_zespol_uziemiajacy[{punkt.element_ref}]",
                title=(
                    f"Zespół uziemiający {punkt.nazwa_pl}: bocznik składowej zerowej "
                    f"({ETYKIETA_PL_WARIANTU_UZIEMIENIA[punkt.wariant(stan_awsc)]})"
                ),
                formula_latex=r"Z_{0,ZU} = Z_{0,TU} + 3 Z_N;\quad Y_{0,ZU} = Z_{base}/Z_{0,ZU}",
                inputs={
                    "ref_id": punkt.element_ref,
                    "stan_awsc": stan_awsc,
                    "z0_tu_ohm": _z_sladu(punkt.z0_tu_ohm),
                    "z_n_spoczynek_ohm": _z_sladu(z_n_spoczynek),
                    "z_n_awsc_zalaczony_ohm": _z_sladu(z_n_zalaczony),
                    "z_base_ohm": z_base_zu,
                    "galezie": [g.to_dict() for g in punkt.galezie],
                    "parametry": [p.to_dict() for p in punkt.parametry],
                },
                substitution=(
                    f"Z0,TU = {_opis_z(punkt.z0_tu_ohm)}; Z_N(spoczynek) = "
                    f"{_opis_z(z_n_spoczynek)}; Z_N(AWSC załączona) = {_opis_z(z_n_zalaczony)}; "
                    f"Z0,ZU({stan_awsc}) = {_opis_z(z0_zu_ohm)} (bocznik "
                    f"{nazwa_szyny[punkt.bus_ref]})"
                ),
                result={"z0_ohm": _z_sladu(z0_zu_ohm), "wariant": punkt.wariant(stan_awsc)},
                notes=punkt.odmowa_pl,
            )
            if z0_zu_ohm is None:
                continue
            if z0_zu_ohm == 0:
                raise OdmowaDanychError(_odmowa_zerowej_impedancji_z0(punkt.nazwa_pl))
            y0_bus[idx, idx] += 1.0 / (z0_zu_ohm / z_base_zu)
            boczniki.setdefault(idx, set()).add(
                _BOCZNIK_REZYSTANCYJNY
                if punkt.bocznik_rezystancyjny(stan_awsc)
                else _BOCZNIK_DLAWIK
            )

    przyczyny, kotwice = _przyczyny_braku_zerowej(
        y0_bus=y0_bus,
        node_index=node_index,
        boczniki=boczniki,
        galezie_bez_z0=galezie_bez_z0,
        powody_bez_z0=powody_bez_z0,
        zrodla_bez_z0=zrodla_bez_z0,
        transformatory_bez_grupy=transformatory_bez_grupy,
        ref_to_node_id=ref_to_node_id,
        nazwy={
            **{b.ref_id: nazwa_elementu(b, "branches") for b in enm.branches},
            **{z.ref_id: nazwa_elementu(z, "sources") for z in enm.sources},
            **{t.ref_id: nazwa_elementu(t, "transformers") for t in enm.transformers},
        },
    )

    # Kotwica numeryczna WYŁĄCZNIE dla węzłów składowych bez żadnego bocznika (droga prądu
    # zerowego zablokowana grupą połączeń, podsieć pływająca): ich blok Y0 jest osobliwy,
    # a każdy ich węzeł ma przyczynę braku wyniku zerowego (``brak_drogi`` / ``brak_danych``)
    # — zwarcie doziemne w nim NIE jest liczone (wiersz bez rdzenia, ``canonical_analysis``),
    # więc kotwica nie udaje uziemienia bezpośredniego. Blok jest rozprzężony z resztą Y0
    # (składowa spójna — brak elementów szeregowych do innych składowych), więc kotwica nie
    # zmienia Z0 żadnego węzła liczonego. Przypięte testem
    # ``tests/enm/test_skladowa_zerowa_zu.py``.
    for idx in kotwice:
        y0_bus[idx, idx] += complex(1e6, 0.0)
    slad_odniesienia = WhiteBoxTracer()
    if kotwice:
        # WHITE BOX: kotwica jest korektą macierzy — ślad sieci zerowej (publikowany w wyniku
        # 1F/2FG) nazywa węzły, których blok domyka, i mówi wprost, że zwarcie doziemne w nich
        # nie jest liczone (wiersz niesie przyczynę), a Z0 węzłów liczonych od niej nie zależy.
        indeksy = set(kotwice)
        nazwy_wezlow = sorted(
            nazwa_elementu(graph.nodes[wezel], "buses")
            for wezel, idx in node_index.items()
            if idx in indeksy
        )
        slad_odniesienia.add(
            key="z0_numerical_reference",
            title="Węzły bez drogi prądu zerowego: domknięcie macierzy, bez wyniku zwarcia",
            formula_latex=(
                r"Y_{0,ii} = 10^{6}\ \text{pu} \Rightarrow "
                r"\text{blok rozprzężony, bez wyniku zwarcia doziemnego}"
            ),
            inputs={"wezly": nazwy_wezlow},
            substitution=(
                f"{', '.join(nazwy_wezlow)}: żaden element sieci nie łączy tych węzłów z ziemią "
                "w składowej zerowej; macierz Y0 dostaje w nich odniesienie numeryczne 10⁶ pu "
                "wyłącznie po to, by dała się odwrócić."
            ),
            result={"liczba_wezlow": len(nazwy_wezlow)},
            notes=(
                "Zwarcie doziemne w tych węzłach NIE jest liczone — wiersz wyniku niesie nazwaną "
                "przyczynę (brak drogi prądu zerowego albo brak danych składowej zerowej). Blok "
                "tych węzłów nie ma elementów szeregowych do reszty sieci zerowej, więc "
                "odniesienie nie zmienia Z0 żadnego węzła liczonego."
            ),
        )

    return SiecZerowa(
        builder=builder,
        node_index=node_index,
        size=size,
        y0_bus=y0_bus,
        trace=tracer.to_list() + transformer_trace + slad_odniesienia.to_list(),
        przyczyny=przyczyny,
    )


def _z_sladu(z: complex | None) -> dict[str, float] | None:
    """Liczba zespolona w śladzie WHITE BOX (JSON) — ten sam kształt co ``z_q_ohm``."""
    return None if z is None else {"re": z.real, "im": z.imag}


def _opis_z(z: complex | None) -> str:
    if z is None:
        return "brak drogi"
    return f"{z.real:.6g} + j{z.imag:.6g} Ω"


def _przyczyny_braku_zerowej(
    *,
    y0_bus: np.ndarray,
    node_index: dict[str, int],
    boczniki: dict[int, set[str]],
    galezie_bez_z0: list[tuple[str, str, str]],
    powody_bez_z0: dict[str, str],
    zrodla_bez_z0: list[tuple[str, str]],
    transformatory_bez_grupy: list[tuple[str, str, str]],
    ref_to_node_id: dict[str, str],
    nazwy: dict[str, str],
) -> tuple[dict[str, BrakWynikuZerowego], tuple[int, ...]]:
    """Przyczyna braku wyniku zerowego każdego węzła składowej sieci zerowej bez uziemienia
    przez małą impedancję (trzy przyczyny nazwane — ``enm.uziemienie_sekcji``).

    Składowa spójna Y0 (elementy szeregowe) z bocznikiem rezystancyjnym (źródło, uzwojenie
    transformatora, zespół z rezystorem / AWSC załączoną / wprost) — liczona. Bez niego:
    ``brak_danych``, gdy gałąź w ruchu bez R′0/X′0 i bez podstawy wartości roboczej
    (``enm.skladowa_zerowa_galezi``) łączy składową z inną (odcięcie brakiem
    danych); ``brak_danych`` także przy innym boczniku, gdy składowa styka się
    z transformatorem bez grupy połączeń (W004 — uzwojenie z uziemionym punktem neutralnym
    możliwe, droga prądu zerowego nieoznaczalna) albo gdy w składowej leży źródło spoza pasma SN
    bez Z0 (impedancja zerowa sieci zasilającej nieznana) — bez takiego bocznika Z0 węzła byłoby
    zawyżone; ``poza_zakresem_iec60909``, gdy jedyną drogą są pojemności B0 i/lub dławik
    (sieć izolowana albo skompensowana); ``brak_drogi``, gdy składowa nie ma żadnego bocznika.
    Zwraca też indeksy węzłów składowych bez ŻADNEGO bocznika (blok osobliwy — kotwica).
    """
    from scipy.sparse import csr_matrix
    from scipy.sparse.csgraph import connected_components

    from .uziemienie_sekcji import KOD_PRZYCZYNY_BRAKU_ZEROWEJ, STATUS_PRZYCZYNY_BRAKU_ZEROWEJ

    size = y0_bus.shape[0]
    if size == 0:
        return {}, ()
    _, etykiety = connected_components(csr_matrix(y0_bus != 0), directed=False)
    rodzaje: dict[int, set[str]] = {}
    for idx, zbior in boczniki.items():
        rodzaje.setdefault(int(etykiety[idx]), set()).update(zbior)
    brakujace: dict[int, list[str]] = {}
    for ref, a, b in galezie_bez_z0:
        ida, idb = ref_to_node_id.get(a), ref_to_node_id.get(b)
        if ida not in node_index or idb not in node_index:
            continue
        la, lb = int(etykiety[node_index[ida]]), int(etykiety[node_index[idb]])
        if la == lb:
            continue
        brakujace.setdefault(la, []).append(ref)
        brakujace.setdefault(lb, []).append(ref)
    trafo_bez_grupy: dict[int, list[str]] = {}
    for ref, a, b in transformatory_bez_grupy:
        for szyna in (a, b):
            wezel_trafo = ref_to_node_id.get(szyna)
            if wezel_trafo in node_index:
                trafo_bez_grupy.setdefault(int(etykiety[node_index[wezel_trafo]]), []).append(ref)
    zrodla_bez_danych: dict[int, list[str]] = {}
    for ref, szyna in zrodla_bez_z0:
        wezel_zrodla = ref_to_node_id.get(szyna)
        if wezel_zrodla not in node_index:
            continue
        zrodla_bez_danych.setdefault(int(etykiety[node_index[wezel_zrodla]]), []).append(ref)
    wynik: dict[str, BrakWynikuZerowego] = {}
    kotwice = tuple(idx for idx in range(size) if not rodzaje.get(int(etykiety[idx])))
    for wezel, idx in sorted(node_index.items()):
        skladowa = int(etykiety[idx])
        zbior = rodzaje.get(skladowa, set())
        if skladowa in zrodla_bez_danych:
            przyczyna = "brak_danych"
            elementy = tuple(sorted(set(zrodla_bez_danych[skladowa])))
            nazwy_zrodel = ", ".join(nazwy[ref] for ref in elementy)
            wynik[wezel] = BrakWynikuZerowego(
                przyczyna=przyczyna,
                kod=KOD_PRZYCZYNY_BRAKU_ZEROWEJ[przyczyna],
                status=STATUS_PRZYCZYNY_BRAKU_ZEROWEJ[przyczyna],
                wyjasnienie=WyjasnienieWerdyktu(
                    zdanie_pl=(
                        "Węzeł w sieci składowej zerowej źródła bez impedancji zerowej "
                        f"({nazwy_zrodel}): Z0 sieci zasilającej nieznane — wynik zwarcia "
                        "doziemnego nieoznaczalny. Podaj R0/X0 albo Z0/Z1 źródła (dane "
                        "operatora sieci zasilającej)."
                    ),
                    przyczyna_pl="Impedancja zerowa sieci zasilającej nieznana.",
                    czego_brakuje=(f"R0/X0 albo Z0/Z1 źródła: {nazwy_zrodel}",),
                ),
                elementy=elementy,
            )
            continue
        uziemiona = _BOCZNIK_REZYSTANCYJNY in zbior
        # Transformator bez grupy połączeń — jak źródło bez Z0: odmowa także w składowej
        # uziemionej innym bocznikiem (uzwojenie z uziemionym punktem neutralnym dołożyłoby
        # bocznik równoległy, więc Z0 węzła bez niego byłoby zawyżone, a prąd zaniżony).
        if uziemiona and skladowa not in trafo_bez_grupy:
            continue
        if skladowa in brakujace or skladowa in trafo_bez_grupy:
            przyczyna = "brak_danych"
            galezie = () if uziemiona else tuple(sorted(set(brakujace.get(skladowa, ()))))
            transformatory = tuple(sorted(set(trafo_bez_grupy.get(skladowa, ()))))
            elementy = tuple(sorted({*galezie, *transformatory}))
            zdania: list[str] = []
            przyczyny_pl: list[str] = []
            czego_brakuje: list[str] = []
            if galezie:
                nazwy_galezi = ", ".join(nazwy[ref] for ref in galezie)
                powody = "; ".join(f"{nazwy[ref]}: {powody_bez_z0[ref]}" for ref in galezie)
                zdania.append(
                    "Węzeł odcięty od uziemienia punktu neutralnego brakiem danych składowej "
                    f"zerowej gałęzi ({nazwy_galezi}): R′0/X′0 nieznane, a wartości roboczej "
                    f"nie da się przyjąć ({powody}) — wynik zwarcia doziemnego nieoznaczalny. "
                    "Uzupełnij R′0 i X′0 gałęzi."
                )
                przyczyny_pl.append(
                    "Dane składowej zerowej gałęzi w ruchu nieznane i bez podstawy wartości "
                    "roboczej."
                )
                czego_brakuje.append(f"R′0 i X′0 gałęzi: {nazwy_galezi}")
            if transformatory:
                nazwy_trafo = ", ".join(nazwy[ref] for ref in transformatory)
                zdania.append(
                    f"Transformator bez grupy połączeń ({nazwy_trafo}): połączenie uzwojeń "
                    "w składowej zerowej nieznane (punkt neutralny uziemiony albo droga "
                    "przerwana trójkątem) — wynik zwarcia doziemnego nieoznaczalny. "
                    "Uzupełnij grupę połączeń transformatora."
                )
                przyczyny_pl.append("Grupa połączeń transformatora nieznana.")
                czego_brakuje.append(f"grupa połączeń transformatora: {nazwy_trafo}")
            wyjasnienie = WyjasnienieWerdyktu(
                zdanie_pl=" ".join(zdania),
                przyczyna_pl=" ".join(przyczyny_pl),
                czego_brakuje=tuple(czego_brakuje),
            )
        elif zbior:
            przyczyna = "poza_zakresem_iec60909"
            elementy = ()
            wyjasnienie = WyjasnienieWerdyktu(
                zdanie_pl=(
                    "Sieć izolowana albo skompensowana (droga prądu zerowego wyłącznie przez "
                    "pojemności doziemne i/lub dławik gaszący) — prąd doziemienia nie jest "
                    "prądem zwarciowym IEC 60909-0 (sieci uziemione przez małą impedancję; "
                    "założenie jawne). Doziemienie ocenia analiza projektu uziemienia punktu "
                    "neutralnego."
                ),
                przyczyna_pl=("Zakres IEC 60909-0 obejmuje sieci uziemione przez małą impedancję."),
            )
        else:
            przyczyna = "brak_drogi"
            elementy = ()
            wyjasnienie = WyjasnienieWerdyktu(
                zdanie_pl=(
                    "Brak drogi prądu zerowego do ziemi (punkt neutralny nieuziemiony, droga "
                    "przerwana grupą połączeń transformatora, brak pojemności doziemnej) — "
                    "zwarcie doziemne nie płynie."
                ),
                przyczyna_pl="Składowa sieci zerowej bez żadnego połączenia z ziemią.",
            )
        wynik[wezel] = BrakWynikuZerowego(
            przyczyna=przyczyna,
            kod=KOD_PRZYCZYNY_BRAKU_ZEROWEJ[przyczyna],
            status=STATUS_PRZYCZYNY_BRAKU_ZEROWEJ[przyczyna],
            wyjasnienie=wyjasnienie,
            elementy=elementy,
        )
    return wynik, kotwice


@dataclass(frozen=True)
class WynikSieciZerowej:
    """Z0-bus sieci składowej zerowej i nazwane przyczyny braku wyniku zerowego per węzeł
    grafu (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA). Węzeł z przyczyną NIE jest liczony w zwarciu
    doziemnym — jego wiersz Z0-bus pochodzi z kotwicy numerycznej albo z sieci izolowanej
    / skompensowanej i nie jest wynikiem IEC 60909."""

    z0_bus: np.ndarray
    przyczyny: dict[str, BrakWynikuZerowego]
    #: Ślad WHITE BOX budowy TEJ SAMEJ macierzy Y0 (jedno złożenie): linie i kable (Z0, B0),
    #: źródła, baterie, transformatory z decyzją grupy połączeń, zespoły uziemiające z OBOMA
    #: stanami AWSC, pominięte Z0 źródeł na szynie SN i domknięcie bloków bez drogi do ziemi.
    #: Bieg doziemny publikuje go jako ``raw_result["siec_zerowa"]``.
    slad: tuple[dict, ...] = ()


def zbuduj_siec_zerowa(
    enm: EnergyNetworkModel,
    graph: NetworkGraph,
    *,
    scenario: Scenario = "MAX",
    stan_awsc: StanAwsc = "spoczynek",
) -> WynikSieciZerowej:
    """Z0-bus (``build_zero_sequence_zbus``) razem z przyczynami braku wyniku zerowego."""
    siec = _assemble_zero_sequence_y0(enm, graph, scenario, stan_awsc=stan_awsc)
    return WynikSieciZerowej(
        z0_bus=_odwroc_y0(siec.size, siec.y0_bus),
        przyczyny=dict(siec.przyczyny),
        slad=tuple(siec.trace),
    )


#: Odmowa zwarcia doziemnego bez drogi powrotu prądu zerowego (macierz Y0 osobliwa) — jedno
#: zdanie dla obu dróg wykrycia (ranga SVD i ``LinAlgError`` inwersji).
KOMUNIKAT_SIEC_ZEROWA_OSOBLIWA = (
    "Sieć składowej zerowej nie ma drogi powrotu prądu zerowego do ziemi — impedancji Z0 "
    "w miejscu zwarcia nie da się wyznaczyć: brak uziemionego punktu neutralnego i brak "
    "pojemności doziemnej B0 linii i kabli. Dla sieci izolowanej podaj susceptancję doziemną "
    "linii i kabli (B0), by uwzględnić prąd pojemnościowy doziemienia."
)


def build_zero_sequence_zbus(
    enm: EnergyNetworkModel,
    graph: NetworkGraph,
    *,
    scenario: Scenario = "MAX",
    stan_awsc: StanAwsc = "spoczynek",
) -> np.ndarray:
    """Z0-bus sieci składowej zerowej — ``build_zero_sequence_zbus_with_trace`` bez śladu."""
    return zbuduj_siec_zerowa(enm, graph, scenario=scenario, stan_awsc=stan_awsc).z0_bus


def build_zero_sequence_zbus_with_trace(
    enm: EnergyNetworkModel,
    graph: NetworkGraph,
    *,
    scenario: Scenario = "MAX",
    stan_awsc: StanAwsc = "spoczynek",
) -> tuple[np.ndarray, list[dict]]:
    """
    Build the zero-sequence Z-bus from ENM fields without mutating the graph — together
    with the WHITE BOX trace of the SAME Y0 matrix (one assembly, one source of truth,
    ``zbuduj_siec_zerowa``): the per-element breakdown (lines/cables Z0 and B0, sources,
    capacitor banks, transformers with the vector-group decision, earthing units with both
    AWSC states) that the short-circuit run publishes for 1F/2F+G (``raw_result.siec_zerowa``).

    The returned matrix uses the same merged node order as
    ``AdmittanceMatrixBuilder(graph)`` so it can be passed directly as
    ``z0_bus`` to the IEC 60909 single-phase and two-phase-ground solvers.

    SM-3 (V12K-181): transformatory wchodzą do sieci składowej zerowej wg grupy
    połączeń wektorowych (patrz ``zero_sequence_transformer``). Sieci bez
    transformatorów z grupą zachowują wynik sprzed karty (TR bez ``vector_group``
    → połączenie OTWARTE, brak wkładu).

    Audyt fizyki fala F (V12K): rangowanie JAWNE przez SVD (``matrix_rank``)
    przed inwersją. ``np.linalg.inv`` NIE gwarantuje ``LinAlgError`` dla macierzy
    rangowo-niedomiarowej (np. sieć izolowana bez żadnej pojemności doziemnej
    B0 — podsieć „unosi się" bez odniesienia do ziemi): LU z pivotingiem
    częściowym potrafi „odwrócić" taką macierz, dając ogromne, fizycznie
    bezsensowne Z0 (rząd 1e15+ Ω) zamiast czytelnego błędu. To byłoby CICHĄ
    fabrykacją wyniku — zakazaną. Jawne sprawdzenie rangi wyłapuje ten
    przypadek niezależnie od tego, czy LU akurat zgłosi wyjątek.

    Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA: składowe bez żadnego bocznika dostają kotwicę
    numeryczną i nazwaną przyczynę braku wyniku (``zbuduj_siec_zerowa``) — sprawdzenie rangi
    zostaje siatką bezpieczeństwa (blok osobliwy, którego klasyfikacja nie objęła).
    """
    siec = zbuduj_siec_zerowa(enm, graph, scenario=scenario, stan_awsc=stan_awsc)
    return siec.z0_bus, list(siec.slad)


def _odwroc_y0(size: int, y0_bus: np.ndarray) -> np.ndarray:
    if size == 0:
        # Graf bez węzłów (sieć pusta albo bez węzła z odniesieniem) — macierz 0x0 jest
        # odwrotnością samej siebie. ``matrix_rank`` na tablicy zerowego rozmiaru rzucał
        # surowy ``ValueError`` numpy (pomiar partii integracji 11: koperta wejścia zwarcia
        # 1F pustego przypadku kończyła się 500 zamiast kopertą z pustym payloadem, jak 3F).
        return np.zeros((0, 0), dtype=complex)
    if np.linalg.matrix_rank(y0_bus) < size:
        raise OdmowaDanychError(KOMUNIKAT_SIEC_ZEROWA_OSOBLIWA)
    try:
        return np.linalg.inv(y0_bus)
    except np.linalg.LinAlgError as exc:
        raise OdmowaDanychError(KOMUNIKAT_SIEC_ZEROWA_OSOBLIWA) from exc


def skladowe_sieci_zerowej(
    enm: EnergyNetworkModel, graph: NetworkGraph, *, scenario: Scenario = "MAX"
) -> dict[str, int]:
    """Numer składowej spójnej SIECI SKŁADOWEJ ZEROWEJ każdego węzła grafu.

    Z TEJ SAMEJ macierzy Y0 co ``build_zero_sequence_zbus`` (``_assemble_zero_sequence_y0``):
    dwa węzły leżą w jednej składowej, gdy łączy je droga elementów szeregowych sieci zerowej
    (linia/kabel z Z0, transformator z drogą HV↔LV). Impedancja zerowa gałęzi wpływa na prąd
    zwarcia doziemnego w węźle wtedy i tylko wtedy, gdy gałąź i węzeł leżą w jednej składowej —
    np. Z0 kabla SN nie wchodzi do zwarcia 1F po stronie nN transformatora Dyn (karta LINIA-110,
    pkt 2: dane przyjęte składowej zerowej per punkt zwarcia, nie per bieg).
    """
    from scipy.sparse import csr_matrix
    from scipy.sparse.csgraph import connected_components

    siec = _assemble_zero_sequence_y0(enm, graph, scenario)
    if siec.size == 0:
        return {}
    _, etykiety = connected_components(csr_matrix(siec.y0_bus != 0), directed=False)
    return {wezel: int(etykiety[indeks]) for wezel, indeks in sorted(siec.node_index.items())}


# G-SCM (V12K-054): classification of enm.generators.gen_type onto the IEC 60909
# short-circuit source model. Full converters (§6.7 bounded current source) →
# InverterSource; rotating machines → voltage-behind-Z″ (§6.3 synchronous / §6.7
# asynchronous, incl. DFIG Type 3 crowbar).
# Public (no leading underscore): karta FAB-H reuses this exact set as the
# single source of truth for "which gen_type needs a catalog k_sc" in
# application/calculation_readiness/service.py — importing the SAME dict
# instead of re-deriving an independent copy (reguła KLASA NIE INSTANCJA:
# two independently-maintained sets are a defect waiting for drift).
FULL_CONVERTER_SC_GEN_TYPES: dict[str, ConverterKind] = {
    "pv_inverter": ConverterKind.PV,
    "bess": ConverterKind.BESS,
    "wind_inverter": ConverterKind.WIND,
    "fw_pmsg": ConverterKind.WIND,  # full-converter (Type 4) PMSG wind
}
# gen_type → wind_type_3 flag (DFIG crowbar relabelling; §6.7 math unchanged). Keys = the
# asynchronous family of `RODZINA_MASZYNY_WG_GEN_TYPE` (pinned by a test, predicates in pairs).
_ASYNC_GEN_TYPES: dict[str, bool] = {
    "fw_dfig": True,  # Type 3 DFIG: crowbar → induction machine
    "fw_scig": False,  # squirrel-cage induction generator
}


def _gen_quantity(gen: Generator) -> int:
    """Number of parallel units the generator element represents (≥ 1).

    ``quantity`` (explicit unit count) takes priority over ``n_parallel``
    (identical-units-in-parallel neutral-element reading via
    ``enm.models.liczba_torow`` — karta CI-A 2026-09-04, jedyna definicja tej
    reguly, wspolna z Cable/Transformer wyzej w tym pliku). Decyzja O-53: cialo
    reguly to `enm.models.liczba_jednostek_zrodla` — ta sama liczba jednostek w solverze
    i w kontroli mocy zrodla operacji domenowych.
    """
    return liczba_jednostek_zrodla(gen)


def _gen_rated_apparent_mva(gen: Generator, mp: dict) -> float | None:
    """Total rated apparent power S_r [MVA] of a CONVERTER installation for SC (I_n for k_sc).

    Prefers the catalog per-unit ``sn_mva`` × parallel count; otherwise falls back
    to |p_mw| (cos φ = 1; |p_mw| is already the installation total). Returns None when no
    positive rating can be established (→ the source is skipped, never fabricated).
    Rotating machines do NOT use this: their rated power is resolved by the working-value
    register (``rozstrzygnij_parametry_maszyny``, karta PODSTAWA-Q) with explicit provenance.
    """
    sn = mp.get("sn_mva")
    if isinstance(sn, int | float) and sn > 0:
        # CONVENTION: materialized ``sn_mva`` is PER-UNIT (catalog nameplate) and the
        # installation total is sn_mva × parallel count — matching how ``p_mw`` is
        # stored (per-unit power × quantity). A producer that ever stores a TOTAL
        # ``sn_mva`` would double-count here; keep sn_mva per-unit at the source.
        return float(sn) * _gen_quantity(gen)
    p = abs(gen.p_mw)
    if p <= 0:
        return None
    return p


def _gen_rated_voltage_kv(
    gen: Generator, mp: dict, bus_voltage_by_ref: dict[str, float]
) -> float | None:
    """Rated voltage U_r [kV]: catalog ``un_kv`` if present, else the bus voltage."""
    un = mp.get("un_kv")
    if isinstance(un, int | float) and un > 0:
        return float(un)
    v = bus_voltage_by_ref.get(gen.bus_ref)
    return v if v and v > 0 else None


def _add_generator_sc_sources(
    enm: EnergyNetworkModel,
    graph: NetworkGraph,
    ref_to_node_id: dict[str, str],
) -> list[dict]:
    """G-SCM (V12K-054): wire ``enm.generators`` as IEC 60909 short-circuit sources.

    Closes the forward-phantom where DER/machines placed by the designer contributed
    ZERO fault current: the mapping injected only their P/Q into the load-flow graph
    and never added an SC source, so ``ShortCircuitIEC60909Solver`` (which reads
    ``graph.get_inverter_sources()`` and the machine shunts) saw nothing. Each
    generator becomes the IEC-correct SC source for its ``gen_type``.

    Zero fabrication: a source is built ONLY from a real nameplate (rated power +
    voltage). Machine parameters the nameplate does not carry (x″d, cos φ_r, I_LR/I_rM,
    η_r, pole pairs p) come from the working-value register
    (``network_model.catalog.wartosci_robocze``, zasada nr 4: designer value on
    ``Generator.overrides`` > nameplate > register proposal); every working value is
    recorded in ``graph.wartosci_robocze_maszyn`` (run assumption + accepted data of
    the verdicts), never silently defaulted.

    ``k_sc`` (udział zwarciowy falownika wg IEC 60909) — karta S-2 AUTORYTET
    (dyrektywa właściciela 2026-09-16: „K_sc pozostaje DEFAULT_FORBIDDEN"):
    katalog konwertera (``ConverterType``/``PVInverterType``/``BESSInverterType``)
    MOŻE nieść ``k_sc`` z karty producenta (odczytany tu z
    ``materialized_params["k_sc"]``). Deklaracja — poprawna czy nie — przechodzi
    BEZ ZMIAN do ``InverterSource.k_sc``: klasyfikację (deklaracja / domyślka
    systemowa / dane niepoprawne / poza dziedziną wyniku / prąd znamionowy
    niepoprawny) liczy WYŁĄCZNIE `InverterSource.k_sc_zrodlo`/`wklad_zrodlo`
    (`network_model.core.wklad_zwarciowy_przeksztaltnika`) z TEGO SAMEGO pola —
    ta funkcja nie duplikuje predykatu, tylko czyta jego wynik. Gdy klasyfikacja
    nie jest DEKLARACJĄ, ta funkcja zwraca ślad WHITE BOX (jeden wpis na źródło)
    surowany przez wywołującego na ``graph.k_sc_assumptions_trace``; gotowość
    zgłasza kod ``inverter.k_sc_default_forbidden``
    (`application/calculation_readiness/service.py`), a warstwa autorytetu
    (`network_model.core.autorytet_wyniku_zwarciowego`) blokuje konsumpcję przez
    zdolności zależne (dobór aparatury, nastawy, koordynacja, pakiety dowodowe).
    Sieć bez k_sc w KAŻDEJ karcie daje DOKŁADNIE ten sam wynik zwarciowy co przed
    tą kartą (1,1 jako domyślka systemowa) — zmienia się wyłącznie proweniencja i
    ślad, nigdy liczba.
    Deterministic: iteration is id-sorted and each source id is the generator ref_id.
    A no-op when there are no generators, so machine-free networks keep a
    byte-identical SC Y-bus (the ybus machine shunt / inverter superposition are
    themselves no-ops without sources).

    Returns:
        WHITE BOX trace entries (possibly empty) — one per generator whose k_sc
        was NOT a miarodajna deklaracja (domyślka systemowa / dane niepoprawne /
        poza dziedziną wyniku / prąd znamionowy niepoprawny), sorted by
        generator ref_id (same determinism as the generator iteration above).
    """
    from network_model.whitebox.tracer import WhiteBoxTracer

    tracer = WhiteBoxTracer()
    bus_voltage_by_ref = {b.ref_id: b.voltage_kv for b in enm.buses}
    # Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: c_max we wzorze K_G maszyny synchronicznej z tabeli 1
    # dla tolerancji sieci nN szyny maszyny — ten sam predykat co węzły grafu.
    wyspy_nn = wyspy_wezlow_nn(enm)
    tolerancje_nn = _tolerancje_nn(wyspy_nn)
    for gen in sorted(enm.generators, key=lambda g: g.ref_id):
        gen_type = gen.gen_type
        if gen_type is None:
            continue
        node_id = ref_to_node_id.get(gen.bus_ref)
        if node_id is None:
            raise OdmowaDanychError(_odmowa_elementu_bez_szyny("Wytworca", gen.ref_id, gen.bus_ref))
        mp = gen.materialized_params or {}
        un_kv = _gen_rated_voltage_kv(gen, mp, bus_voltage_by_ref)
        if un_kv is None:
            continue

        if gen_type in FULL_CONVERTER_SC_GEN_TYPES:
            sr_mva = _gen_rated_apparent_mva(gen, mp)
            if sr_mva is None:
                continue
            in_rated_a = prad_znamionowy_a(sr_mva, un_kv)
            k_sc_raw = mp.get("k_sc")
            # DEKLARACJA PRZECHODZI SUROWO (karta S-2 AUTORYTET): to pole niesie
            # dokładnie to, co karta katalogowa podała — poprawne albo nie. Nie
            # ma tu DRUGIEGO predykatu ważności: `InverterSource.k_sc_zrodlo`/
            # `wklad_zrodlo` (jeden przedykat, `wklad_zwarciowy_przeksztaltnika`)
            # klasyfikuje ją NIŻEJ, z tego samego pola — dwa niezależne warunki
            # o tej samej daniej byłyby defektem czekającym na dane brzegowe
            # (reguła KLASA NIE INSTANCJA, CLAUDE.md pkt „predykaty parami").
            zrodlo_sc = InverterSource(
                id=gen.ref_id,
                name=nazwa_elementu(gen, "generators"),
                node_id=node_id,
                type_ref=gen.catalog_ref,
                converter_kind=FULL_CONVERTER_SC_GEN_TYPES[gen_type],
                in_rated_a=in_rated_a,
                k_sc=k_sc_raw,
                contributes_negative_sequence=True,
                contributes_zero_sequence=False,
            )
            graph.add_inverter_source(zrodlo_sc)
            if zrodlo_sc.wklad_zrodlo != K_SC_ZRODLO_DEKLARACJA:
                tracer.add(
                    key=f"k_sc_zalozenie_{gen.ref_id}",
                    title="Założenie: udział zwarciowy falownika k_sc",
                    formula_latex=r"I_k = k_{sc} \cdot I_n",
                    inputs={
                        "generator_ref": gen.ref_id,
                        "catalog_ref": gen.catalog_ref,
                    },
                    substitution=_k_sc_substytucja_zalozenia(zrodlo_sc, gen.catalog_ref),
                    result={"k_sc": zrodlo_sc.k_sc_efektywny},
                    notes=_k_sc_notatka_zalozenia(zrodlo_sc.wklad_zrodlo),
                )
        elif RODZINA_MASZYNY_WG_GEN_TYPE.get(gen_type) == RODZINA_MASZYNA_SYNCHRONICZNA:
            # Karta PODSTAWA-Q (rozstrzygnięcie 3, zasada nr 4): S_rG, x″d i cos φ_rG —
            # projektant (`Generator.overrides`) > tabliczka elementu > propozycja rejestru
            # wartości roboczych (S_rG: z punktu pracy elementu, jawnie jako wartość robocza).
            # Wartość robocza idzie do grafu jako wpis danych przyjętych.
            rodzina_s = RODZINA_MASZYNA_SYNCHRONICZNA
            liczba_s = _gen_quantity(gen)
            parametry_s = rozstrzygnij_parametry_maszyny(
                rodzina_s,
                tabliczka=mp,
                wartosci_projektanta=wartosci_projektanta_maszyny(rodzina_s, gen.overrides),
                moc_czynna_punktu_pracy_mw=gen.p_mw,
                liczba_jednostek=liczba_s,
            )
            moc_pozorna = parametry_s[PARAMETR_MOC_POZORNA_MASZYNY]
            if moc_pozorna.wartosc is None:
                continue
            cos_phi_r = _wartosc_parametru(parametry_s, PARAMETR_COS_PHI_MASZYNY)
            graph.add_synchronous_machine_source(
                SynchronousMachineSource(
                    id=gen.ref_id,
                    name=gen.name,
                    node_id=node_id,
                    sr_mva=_moc_grupy(
                        moc_pozorna,
                        liczba_s,
                        moc_grupy_z_punktu_pracy=moc_pozorna_z_czynnej_mva(
                            abs(gen.p_mw), cos_phi_r
                        ),
                    ),
                    ur_kv=un_kv,
                    xd_subtransient_pu=_wartosc_parametru(parametry_s, PARAMETR_XD),
                    cos_phi_r=cos_phi_r,
                    tolerancja_nn=tolerancje_nn.get(gen.bus_ref),
                    tolerancja_nn_robocza=_robocza_nn(wyspy_nn, gen.bus_ref),
                )
            )
            _zapisz_wartosci_robocze_maszyny(
                graph, gen, parametry_s, wielkosci_wg_parametru=dict.fromkeys(parametry_s, None)
            )
        elif RODZINA_MASZYNY_WG_GEN_TYPE.get(gen_type) == RODZINA_MASZYNA_ASYNCHRONICZNA:
            # Karta PODSTAWA-Q (decyzja architekta do meldunku 0a90bbc97): moc znamionowa P_rM
            # (IEC 60909-0:2016 pkt 6.7, m = P_rM/p pkt 9.1.2) to dana MASZYNY, nie punkt pracy
            # |p_mw|. Rejestr wartości roboczych: projektant > tabliczka `pr_mw` > P_rM z mocy
            # pozornej tabliczki S_rM·η_r·cos φ_r > propozycja z punktu pracy (jawna wartość
            # robocza). Moc pozorna S_rM tabliczki wchodzi do Z_M wprost. Liczba par biegunów p,
            # I_LR/I_rM, cos φ_rM i η_rM — ten sam rejestr.
            rodzina_a = RODZINA_MASZYNA_ASYNCHRONICZNA
            liczba_a = _gen_quantity(gen)
            parametry_a = rozstrzygnij_parametry_maszyny(
                rodzina_a,
                tabliczka=mp,
                wartosci_projektanta=wartosci_projektanta_maszyny(rodzina_a, gen.overrides),
                moc_czynna_punktu_pracy_mw=gen.p_mw,
                liczba_jednostek=liczba_a,
            )
            moc_znamionowa = parametry_a[PARAMETR_MOC_ZNAMIONOWA_MASZYNY]
            if moc_znamionowa.wartosc is None:
                continue
            moc_pozorna_jednostki = moc_pozorna_tabliczki_maszyny_mva(mp)
            maszyna = AsynchronousMachineSource(
                id=gen.ref_id,
                name=gen.name,
                node_id=node_id,
                pr_mw=_moc_grupy(moc_znamionowa, liczba_a, moc_grupy_z_punktu_pracy=abs(gen.p_mw)),
                ur_kv=un_kv,
                sr_mva_tabliczki=(
                    None if moc_pozorna_jednostki is None else moc_pozorna_jednostki * liczba_a
                ),
                cos_phi_r=_wartosc_parametru(parametry_a, PARAMETR_COS_PHI_MASZYNY),
                efficiency=_wartosc_parametru(parametry_a, PARAMETR_SPRAWNOSC),
                i_lr_ratio=_wartosc_parametru(parametry_a, PARAMETR_KROTNOSC_I_LR),
                pole_pairs=int(_wartosc_parametru(parametry_a, PARAMETR_PARY_BIEGUNOW)),
                liczba_jednostek=liczba_a,
                wind_type_3=_ASYNC_GEN_TYPES[gen_type],
            )
            graph.add_asynchronous_machine_source(maszyna)
            _zapisz_wartosci_robocze_maszyny(
                graph,
                gen,
                parametry_a,
                wielkosci_wg_parametru=_wielkosci_parametrow_asynchronicznej(maszyna, parametry_a),
            )

    return tracer.to_list()


def _wartosc_parametru(parametry: dict[str, WartoscRozstrzygnieta], parametr: str) -> float:
    """Wartość rozstrzygniętego parametru maszyny — rejestr ma propozycję dla każdego z nich."""
    wartosc = parametry[parametr].wartosc
    if wartosc is None:
        raise AssertionError(f"Rejestr wartości roboczych nie rozstrzygnął parametru {parametr!r}.")
    return wartosc


def _moc_grupy(
    moc: WartoscRozstrzygnieta, liczba_jednostek: int, *, moc_grupy_z_punktu_pracy: float
) -> float:
    """Moc znamionowa CAŁEJ grupy jednakowych maszyn z mocy rozstrzygniętej dla jednej.

    Dana tabliczki, projektanta i wyznaczona z tabliczki dotyczą jednej maszyny — grupa to
    × liczba jednostek. Propozycja jest określona na CAŁYM elemencie (punkt pracy), więc grupa
    bierze ją wprost z punktu pracy (bez dzielenia i mnożenia przez liczbę jednostek — ta sama
    liczba zmiennoprzecinkowa, którą obliczenie przyjmowało przed kartą).
    """
    if moc.pochodzenie == "PROPOZYCJA":
        return moc_grupy_z_punktu_pracy
    return _wartosc_parametru({moc.parametr: moc}, moc.parametr) * liczba_jednostek


def _wielkosci_parametrow_asynchronicznej(
    maszyna: AsynchronousMachineSource, parametry: dict[str, WartoscRozstrzygnieta]
) -> dict[str, tuple[str, ...] | None]:
    """Wielkości zwarciowe, na które wpływa KAŻDY parametr maszyny asynchronicznej.

    ``None`` — wszystkie prądy punktu (parametr zmienia impedancję Z_M), ``WIELKOSC_TYLKO_IB``
    — wyłącznie I_b (parametr zmienia tylko moc na parę biegunów m = P_rM/p, krzywa q pkt
    9.1.2), ``()`` — żadna (parametr nie wchodzi do obliczenia). Parametr zmieniający m daje
    wszystkie prądy, gdy w zakresie jego bramy wartości zmienia wiersz R_M/X_M maszyny SN
    (predykat z modelu maszyny — jedno źródło progu tabeli). Przy S_rM z tabliczki Z_M nie
    zależy od P_rM, η_r ani cos φ_r; η_r i cos φ_r wpływają wtedy na m tylko przez P_rM
    wyznaczoną z S_rM (pkt 6.7), a przy P_rM podanej wprost — na nic.
    """

    def wg_m(m_od_mw: float, m_do_mw: float) -> tuple[str, ...] | None:
        return (
            None if maszyna.r_over_x_zalezy_od_mocy_na_pare(m_od_mw, m_do_mw) else WIELKOSC_TYLKO_IB
        )

    def zakres(parametr: str) -> tuple[float, float]:
        opis = OPISY_PARAMETROW_MASZYNY[parametr]
        return opis.dopuszczalne_od, opis.dopuszczalne_do

    wielkosci: dict[str, tuple[str, ...] | None] = dict.fromkeys(parametry, None)
    moc_jednostki = maszyna.moc_jednostki_mw
    wielkosci[PARAMETR_PARY_BIEGUNOW] = wg_m(moc_jednostki / PARY_BIEGUNOW_MAX, moc_jednostki)
    if maszyna.sr_mva_tabliczki is None:
        return wielkosci
    pary = max(1, maszyna.pole_pairs)
    p_od, p_do = zakres(PARAMETR_MOC_ZNAMIONOWA_MASZYNY)
    wielkosci[PARAMETR_MOC_ZNAMIONOWA_MASZYNY] = wg_m(p_od / pary, p_do / pary)
    for parametr in (PARAMETR_SPRAWNOSC, PARAMETR_COS_PHI_MASZYNY):
        if not moc_znamionowa_z_mocy_pozornej(parametry[PARAMETR_MOC_ZNAMIONOWA_MASZYNY]):
            wielkosci[parametr] = ()
            continue
        od, do = zakres(parametr)
        wartosc = _wartosc_parametru(parametry, parametr)
        m = maszyna.p_per_pole_mw
        wielkosci[parametr] = wg_m(m * od / wartosc, m * do / wartosc)
    return wielkosci


def _zapisz_wartosci_robocze_maszyny(
    graph: NetworkGraph,
    gen: Generator,
    parametry: dict[str, WartoscRozstrzygnieta],
    *,
    wielkosci_wg_parametru: dict[str, tuple[str, ...] | None],
) -> None:
    """Wpisy wartości roboczych maszyny do grafu (``graph.wartosci_robocze_maszyn``).

    ``None`` w ``wielkosci_wg_parametru`` = parametr wpływa na wszystkie prądy zwarciowe
    punktu (impedancja maszyny), ``()`` = parametr nie wchodzi do obliczenia (wartość robocza
    bez wpływu nie jest daną przyjętą). Maszyna wyłącznie z danymi tabliczki nie dostaje wpisu.
    """
    wpisy = []
    for parametr, rozstrzygniecie in parametry.items():
        wielkosci = wielkosci_wg_parametru[parametr]
        if not rozstrzygniecie.robocza or wielkosci == ():
            continue
        wpisy.append(
            wpis_parametru_maszyny(
                rozstrzygniecie,
                source_id=gen.ref_id,
                source_name=nazwa_elementu(gen, "generators"),
                wielkosci=WIELKOSCI_ZWARCIOWE if wielkosci is None else wielkosci,
            )
        )
    if wpisy:
        graph.wartosci_robocze_maszyn[gen.ref_id] = tuple(wpisy)


def _k_sc_substytucja_zalozenia(zrodlo: InverterSource, catalog_ref: str | None) -> str:
    """Tekst podstawienia śladu WHITE BOX dla źródła BEZ miarodajnej deklaracji k_sc.

    Cztery gałęzie — jedna na każdy znacznik niemiarodajny
    (`network_model.core.wklad_zwarciowy_przeksztaltnika`). Tekst dla
    ``DOMYSLNE_SYSTEMOWE`` jest BIT W BIT tożsamy z tekstem sprzed karty S-2
    (parytet fixtur/testów, które go asertują) — pozostałe trzy są NOWE, bo
    sprzed tej karty nie miały własnego wpisu (były cicho zrównane z brakiem).
    """
    ref_pl = catalog_ref or "(brak referencji katalogowej)"
    if zrodlo.wklad_zrodlo == K_SC_ZRODLO_NIEPOPRAWNE:
        return (
            f"k_sc = 1,1 przyjęte do rachunku ROBOCZEGO — karta katalogowa konwertera "
            f"{ref_pl} niesie wartość k_sc={zrodlo.k_sc!r}, niemożliwą do przyjęcia "
            "(wymagana liczba skończona i dodatnia)"
        )
    if zrodlo.wklad_zrodlo == K_SC_ZRODLO_POZA_DZIEDZINA:
        return (
            f"k_sc = 1,1 przyjęte do rachunku ROBOCZEGO — iloczyn zadeklarowanego "
            f"k_sc={zrodlo.k_sc!r} i prądu znamionowego źródła (karta {ref_pl}) "
            "wykracza poza zakres liczb skończonych"
        )
    if zrodlo.wklad_zrodlo == K_SC_ZRODLO_PRAD_NIEPOPRAWNY:
        return (
            f"k_sc = 1,1 przyjęte do rachunku ROBOCZEGO — źródło (karta {ref_pl}) nie ma "
            "poprawnego prądu znamionowego I_n, więc wkładu nie da się policzyć"
        )
    return f"k_sc = 1,1 przyjęte — brak danych karty katalogowej konwertera {ref_pl}"


def _k_sc_notatka_zalozenia(wklad_zrodlo: str) -> str:
    """Notatka śladu WHITE BOX — treść zależna od znacznika niemiarodajności.

    Treść jest tekstem czytanym przez projektanta (ślad założeń w wynikach i w UI),
    więc obowiązuje ją reguła języka inżynierskiego: bez kryptonimów kart i bez
    przypisywania domyślki systemowej normie albo katalogowi (odbiór 2026-09-16 —
    wcześniejsza treść cytowała identyfikatory kart i „wartość domyślną IEC 60909").
    """
    if wklad_zrodlo == K_SC_ZRODLO_NIEPOPRAWNE:
        return (
            "DANE NIEPOPRAWNE: karta katalogowa przekształtnika niesie "
            "k_sc niemożliwy do przyjęcia (NaN, ±Inf, zero, ujemny, tekst albo bool) — to "
            "błąd danych, nie brak. Wynik zwarciowy NIE jest miarodajny dla doboru "
            "aparatury, nastaw zabezpieczeń ani pakietu dowodowego. Popraw k_sc w karcie "
            "katalogowej."
        )
    if wklad_zrodlo == K_SC_ZRODLO_POZA_DZIEDZINA:
        return (
            "POZA DZIEDZINĄ WYNIKU: współczynnik k_sc i prąd znamionowy "
            "są każdy z osobna poprawne, ale ich iloczyn nie jest liczbą skończoną. Wynik "
            "zwarciowy NIE jest miarodajny dla doboru aparatury, nastaw zabezpieczeń ani "
            "pakietu dowodowego. Popraw dane znamionowe źródła."
        )
    if wklad_zrodlo == K_SC_ZRODLO_PRAD_NIEPOPRAWNY:
        return (
            "PRĄD ZNAMIONOWY NIEPOPRAWNY: źródło nie ma poprawnej "
            "danej znamionowej, więc wkładu zwarciowego nie da się policzyć. Wynik "
            "zwarciowy NIE jest miarodajny dla doboru aparatury, nastaw zabezpieczeń ani "
            "pakietu dowodowego. Uzupełnij tabliczkę znamionową źródła."
        )
    return (
        "ZAREJESTROWANE ZAŁOŻENIE: karta katalogowa przekształtnika nie niesie k_sc — "
        "przyjęto domyślkę systemową k_sc = 1,1 (nie jest to dana producenta ani wartość "
        "wymagana normą). Wynik zwarciowy jest roboczy: NIE jest miarodajny dla doboru "
        "aparatury, nastaw zabezpieczeń ani pakietu dowodowego. Wpisz k_sc z karty "
        "producenta, aby zastąpić domyślkę zmierzoną wartością."
    )


def build_inverter_k_sc_trace(enm: EnergyNetworkModel) -> list[dict]:
    """Ślad WHITE BOX zarejestrowanych założeń k_sc (udziału zwarciowego falownika).

    Karta FAB-H — ten sam wzorzec co ślad ``build_zero_sequence_zbus_with_trace`` powyżej: funkcja
    publiczna, wywoływalna niezależnie od pełnego biegu SC, do wglądu/testów w ślad
    założeń bez konieczności uruchamiania solvera. Pusta lista, gdy każdy konwerter
    ma jawne ``k_sc`` w karcie katalogowej (albo gdy sieć nie ma konwerterów).
    """
    return map_enm_to_network_graph(enm).k_sc_assumptions_trace


def build_grid_source_trace(
    enm: EnergyNetworkModel, scenario: Scenario = "MAX"
) -> list[dict[str, Any]]:
    """Ślad WHITE BOX wyprowadzenia Z_Q każdego źródła sieciowego (CV-4.3 K6).

    Ten sam wzorzec co ``build_inverter_k_sc_trace``: funkcja publiczna, do wglądu
    bez biegu solvera; jeden wpis na źródło z policzalną impedancją (tryb mocy
    zwarciowej z c wg IEC 60909-0 eq. (6) albo impedancja jawna), w kolejności
    ``ref_id`` źródeł. Źródło bez danych (``None``) nie ma wpisu — tak samo jak nie
    ma bocznika Y_Q w grafie (``map_enm_to_network_graph``): jeden predykat.
    """
    napiecie = {bus.ref_id: bus.voltage_kv for bus in enm.buses}
    wyspy_nn = wyspy_wezlow_nn(enm)
    tolerancje_nn = _tolerancje_nn(wyspy_nn)
    slad: list[dict[str, Any]] = []
    for source in sorted(enm.sources, key=lambda s: s.ref_id):
        u_kv = napiecie.get(source.bus_ref, 0.0)
        if u_kv <= 0:
            continue
        wynik = impedancja_zrodla_sieciowego(
            source,
            u_kv,
            scenario,
            tolerancja_nn=tolerancje_nn.get(source.bus_ref),
            tolerancja_nn_robocza=_robocza_nn(wyspy_nn, source.bus_ref),
        )
        if wynik is None or wynik[0] == 0:
            continue
        slad.append(wynik[1])
    return slad


def generator_reguluje_napiecie(gen: Generator) -> bool:
    """Generator w trybie regulacji napięcia (`meta.control_mode == "REGULACJA_NAPIECIA"`) —
    jego szyna jest węzłem PV rozpływu (karta CV-4.1b, A3-04). JEDEN predykat dla mapowania
    grafu i dla kontroli reprezentowalności modelu odbiorów ZIP szyny
    (`enm/load_zip_model.py::odmowy_agregatu_zip`)."""
    meta = gen.meta or {}
    return str(meta.get("control_mode") or "").strip() == "REGULACJA_NAPIECIA"


def map_enm_to_network_graph(
    enm: EnergyNetworkModel, *, scenario: Scenario = "MAX"
) -> NetworkGraph:
    """
    Map ENM to NetworkGraph consumed by existing solvers.

    This is a pure, deterministic function: same ENM → same NetworkGraph.
    """
    graph = NetworkGraph()
    # Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: tolerancja sieci nN per szyna — JEDEN predykat
    # (`enm.tolerancja_nn`); węzły nN niosą ją do doboru c, źródła nN do Z_Q (eq. 6). Karta
    # TOLERANCJA-NN-WARTOSC-ROBOCZA: klasa i jej pochodzenie z TEJ SAMEJ wyspy.
    wyspy_nn = wyspy_wezlow_nn(enm)
    tolerancje_nn = _tolerancje_nn(wyspy_nn)

    # Collect source bus refs for SLACK identification
    source_bus_refs: set[str] = {s.bus_ref for s in enm.sources}

    # Collect P/Q per bus from loads and generators
    bus_p: dict[str, float] = {}
    bus_q: dict[str, float] = {}
    # ADR-011 (Z-ZIP-04): per-bus ZIP components for power-weighted aggregation.
    # Each entry is (P0_mw, Q0_mw, coeffs|None); coeffs comes from the load's
    # catalog-materialized params (None => constant power, no change).
    bus_zip_components: dict[str, list[tuple[float, float, ZipCoeffs | None]]] = {}
    # Defect D1 (audit 2026-08-01): the ODBIOROWA part of the bus power, kept
    # apart from bus_p/bus_q (which are NET: loads minus generation). The ZIP
    # polynomial is built from the loads, so it may only be applied to the loads.
    bus_load_p: dict[str, float] = {}
    bus_load_q: dict[str, float] = {}
    # O-49 pkt 6: odniesienie częstotliwościowe odbioru bez `f0_hz` = częstotliwość
    # STUDIUM (to samo pole nagłówka, które czyta `assembler.czestotliwosc_studium_hz`).
    f_studium_hz = float(enm.header.defaults.frequency_hz)
    for load in enm.loads:
        bus_p[load.bus_ref] = bus_p.get(load.bus_ref, 0.0) - load.p_mw
        bus_q[load.bus_ref] = bus_q.get(load.bus_ref, 0.0) - load.q_mvar
        bus_load_p[load.bus_ref] = bus_load_p.get(load.bus_ref, 0.0) - load.p_mw
        bus_load_q[load.bus_ref] = bus_load_q.get(load.bus_ref, 0.0) - load.q_mvar
        bus_zip_components.setdefault(load.bus_ref, []).append(
            (
                load.p_mw,
                load.q_mvar,
                zip_coeffs_from_materialized_params(load.materialized_params, f_studium_hz),
            )
        )
    # Karta FAB-H (H2, KLASA NIE INSTANCJA): moc bierna wytwórcy rozstrzygana przez
    # JEDNO wspólne źródło prawdy (moc_bierna_wytworcy), tak samo jak w
    # canonical_analysis.py/v126_contracts.py i w bramce gotowości
    # (calculation_readiness/service.py::_generator_q_mvar_jawne). BRAK => 0,0
    # jako WYŁĄCZNIE strukturalne wypełnienie grafu (ten sam graf służy też
    # zwarciom, gdzie Q nie jest potrzebne) — rozpływ mocy jest zablokowany PRZED
    # tym punktem przez BLOCKER `generator.q_missing`, gdy Q jest naprawdę
    # nieznane (nie wyprowadzalne z jawnego Q-set-pointu karty).
    from solver_input.moc_bierna_wytworcy import moc_bierna_wytworcy

    for gen in enm.generators:
        bus_p[gen.bus_ref] = bus_p.get(gen.bus_ref, 0.0) + gen.p_mw
        wynik_q = moc_bierna_wytworcy(gen, gen.materialized_params)
        # Q nieznane = wklad POMINIETY, nie 0,0 (ten sam predykat co BLOCKER
        # `generator.q_missing` w bramce gotowosci — jedno zrodlo prawdy).
        if wynik_q.q_mvar is not None:
            bus_q[gen.bus_ref] = bus_q.get(gen.bus_ref, 0.0) + wynik_q.q_mvar

    # Karta CV-4.1b (A3-04): generator w trybie regulacji napięcia
    # (`meta.control_mode == "REGULACJA_NAPIECIA"`) czyni swoją szynę węzłem PV
    # (napięcie zadane, moc bierna wynikiem solvera) zamiast PQ — konstytucja A3-04
    # ("pv_bus_ids=[] zawsze" był defektem: generator z regulacją napięcia był
    # liczony jak węzeł obciążeniowy). JEDNA CHARAKTERYSTYKA NA WĘZEŁ (jak
    # `_build_converter_control_by_node` w `enm/assembler.py` dla cosφ/Q(U)): dwa
    # generatory z aktywną regulacją napięcia na tej samej szynie są nieprzedstawialne
    # w kontrakcie solvera (`PowerFlowInput.pv` niesie jedną nastawę na węzeł) —
    # odrzucane jawnym błędem, nigdy po cichu (ostatni wygrywa).
    bus_voltage_control: dict[str, float | None] = {}
    bus_voltage_control_gen_ref: dict[str, str] = {}
    for gen in sorted(enm.generators, key=lambda g: g.ref_id):
        meta = gen.meta or {}
        if not generator_reguluje_napiecie(gen):
            continue
        if gen.bus_ref in bus_voltage_control_gen_ref:
            pierwszy_ref = bus_voltage_control_gen_ref[gen.bus_ref]
            # Partia integracji 10: nazwy z modelu w treści, identyfikatory w `dane`.
            raise OdmowaNazwana(
                f"{opis_elementu(enm, gen.bus_ref, 'Szyna')} ma więcej niż jeden generator "
                f"w trybie regulacji napięcia ({opis_elementu(enm, pierwszy_ref, 'generator')}"
                f" i {opis_obiektu(gen, 'generator')}) — kontrakt rozpływu dopuszcza jedną "
                "nastawę napięcia na węzeł.",
                kod=KOD_DWA_GENERATORY_REGULACJI_NAPIECIA,
                dane={"element_ref": gen.bus_ref, "generatory_ref": (pierwszy_ref, gen.ref_id)},
            )
        u_set_raw = meta.get("u_set_pu")
        bus_voltage_control[gen.bus_ref] = (
            float(u_set_raw)
            if isinstance(u_set_raw, int | float) and not isinstance(u_set_raw, bool)
            else None
        )
        bus_voltage_control_gen_ref[gen.bus_ref] = gen.ref_id

    # Map ref_id → node_id for cross-referencing
    ref_to_node_id: dict[str, str] = {}

    # 1. Buses → Nodes (sorted by ref_id)
    for bus in sorted(enm.buses, key=lambda b: b.ref_id):
        node_id = _ref_to_uuid(bus.ref_id)
        ref_to_node_id[bus.ref_id] = node_id

        is_slack = bus.ref_id in source_bus_refs
        p = bus_p.get(bus.ref_id, 0.0)
        q = bus_q.get(bus.ref_id, 0.0)
        # ADR-011 (Z-ZIP-04): power-weighted aggregation of the bus loads into a
        # single ZipCoeffs. Constant-power buses aggregate to None (unchanged).
        bus_zip = aggregate_zip(bus_zip_components.get(bus.ref_id, []))
        # Defect D1: a ZIP bus carries its LOAD part alongside the net power, so
        # the solver can scale the polynomial by the loads only and keep the
        # generation constant. Without ZIP coefficients there is nothing to
        # scale, so nothing is carried (historical path, unchanged).
        zip_load_p = bus_load_p.get(bus.ref_id, 0.0) if bus_zip is not None else None
        zip_load_q = bus_load_q.get(bus.ref_id, 0.0) if bus_zip is not None else None
        has_voltage_control = bus.ref_id in bus_voltage_control

        if is_slack:
            # Karta CV-4.1b (A3-04): szyna bilansująca (SLACK) ma już zadane napięcie
            # (moduł I kąt) — nie może JEDNOCZEŚNIE być węzłem PV regulowanym przez
            # generator (dwie sprzeczne nastawy modułu napięcia tej samej szyny).
            if has_voltage_control:
                generator_ref = bus_voltage_control_gen_ref[bus.ref_id]
                raise OdmowaNazwana(
                    f"{opis_obiektu(bus, 'Szyna bilansująca')} nie może być jednocześnie "
                    "węzłem regulacji napięcia "
                    f"({opis_elementu(enm, generator_ref, 'generator')}) — szyna SLACK ma "
                    "już zadane napięcie źródła zasilania.",
                    kod=KOD_SZYNA_BILANSUJACA_Z_REGULACJA_NAPIECIA,
                    dane={"element_ref": bus.ref_id, "generator_ref": generator_ref},
                )
            node = Node(
                id=node_id,
                name=nazwa_elementu(bus, "buses"),
                node_type=NodeType.SLACK,
                voltage_level=bus.voltage_kv,
                tolerancja_nn=tolerancje_nn.get(bus.ref_id),
                tolerancja_nn_robocza=_robocza_nn(wyspy_nn, bus.ref_id),
                voltage_magnitude=1.0,
                voltage_angle=0.0,
                active_power=p if p != 0.0 else None,
                reactive_power=q if q != 0.0 else None,
                zip_coeffs=bus_zip,
                zip_load_active_power=zip_load_p,
                zip_load_reactive_power=zip_load_q,
            )
        elif has_voltage_control:
            # Karta CV-4.1b (A3-04): węzeł PV — napięcie ZADANE (nastawa generatora
            # z regulacją), moc bierna WYNIKIEM solvera (nie jest tu deklarowana —
            # tak jak na szynie SLACK powyżej). `voltage_magnitude=None` (nastawa
            # niekompletna, np. bieg z pominięciem walidatora ENM) daje jawny błąd
            # KONSTRUKCJI węzła (Node.__post_init__: „Węzeł PV wymaga zdefiniowanej
            # amplitudy napięcia") — solver FROZEN nigdy nie dostaje fabrykowanej
            # nastawy 1,0 pu za brakującą.
            node = Node(
                id=node_id,
                name=nazwa_elementu(bus, "buses"),
                node_type=NodeType.PV,
                voltage_level=bus.voltage_kv,
                tolerancja_nn=tolerancje_nn.get(bus.ref_id),
                tolerancja_nn_robocza=_robocza_nn(wyspy_nn, bus.ref_id),
                voltage_magnitude=bus_voltage_control[bus.ref_id],
                active_power=p,
                reactive_power=q if q != 0.0 else None,
            )
        else:
            node = Node(
                id=node_id,
                name=nazwa_elementu(bus, "buses"),
                node_type=NodeType.PQ,
                voltage_level=bus.voltage_kv,
                tolerancja_nn=tolerancje_nn.get(bus.ref_id),
                tolerancja_nn_robocza=_robocza_nn(wyspy_nn, bus.ref_id),
                active_power=p,
                reactive_power=q,
                zip_coeffs=bus_zip,
                zip_load_active_power=zip_load_p,
                zip_load_reactive_power=zip_load_q,
            )
        graph.add_node(node)

    # 2. Branches → LineBranch / Switch (sorted by ref_id)
    for branch in sorted(enm.branches, key=lambda b: b.ref_id):
        from_id = ref_to_node_id.get(branch.from_bus_ref)
        to_id = ref_to_node_id.get(branch.to_bus_ref)
        if from_id is None or to_id is None:
            brakujaca = branch.from_bus_ref if from_id is None else branch.to_bus_ref
            raise OdmowaDanychError(_odmowa_elementu_bez_szyny("Galaz", branch.ref_id, brakujaca))

        branch_id = _ref_to_uuid(branch.ref_id)

        if isinstance(branch, OverheadLine | Cable):
            b_us_per_km = 0.0
            if branch.b_siemens_per_km is not None:
                b_us_per_km = simens_na_mikrosimens(branch.b_siemens_per_km)  # S/km → μS/km

            rated_a = 0.0
            if branch.rating and branch.rating.in_a:
                rated_a = branch.rating.in_a

            # P0.1 nN (karta P0.1, add_nn_cable_segment): n torow identycznych
            # kabli na TEJ SAMEJ trasie. TA SAMA zasada co Transformer.n_parallel
            # (Z/n, Sn*n) — n identycznych impedancji w rownoleglym polaczeniu
            # dziela sie na n, obciazalnosc mnozy sie przez n. `liczba_torow`
            # obejmuje OverheadLine (pole nie istnieje na tym typie — brak zmiany
            # zachowania linii napowietrznych, patrz jej docstring). None/1 =
            # pojedynczy tor (reduce-to-current-behavior, bajtowo identyczne dla
            # istniejacych kabli SN i nN bez tego pola). Karta CI-A
            # (2026-09-04): JEDYNA definicja tej reguly zyje w
            # `enm.models.liczba_torow` — byla tu wlasna kopia `or 1`.
            n_parallel_cable = liczba_torow(branch)
            r_ohm_per_km_eff = branch.r_ohm_per_km / n_parallel_cable
            x_ohm_per_km_eff = branch.x_ohm_per_km / n_parallel_cable
            b_us_per_km_eff = b_us_per_km * n_parallel_cable
            rated_a_eff = rated_a * n_parallel_cable

            bt = BranchType.CABLE if isinstance(branch, Cable) else BranchType.LINE
            lb = LineBranch(
                id=branch_id,
                name=nazwa_elementu(branch, "branches"),
                branch_type=bt,
                from_node_id=from_id,
                to_node_id=to_id,
                in_service=(branch.status == "closed"),
                r_ohm_per_km=r_ohm_per_km_eff,
                x_ohm_per_km=x_ohm_per_km_eff,
                b_us_per_km=b_us_per_km_eff,
                length_km=branch.length_km,
                # BRAK OBCIAZALNOSCI ZOSTAJE BRAKIEM (0.0), NIE STAJE SIE 1 A.
                # Stan PRZED wstawial tu 1.0 A kazdej galezi bez `rating.in_a`,
                # wiec kryterium obciazenia liczylo sie ZAWSZE — z liczby, ktorej
                # nikt nie zmierzyl. Skutek zmierzony (karta N-1-BACKEND): linia
                # 15 kV bez obciazalnosci przy pradzie 40,6 A dostawala od
                # walidacji energetycznej werdykt „Obciazenie 4056,80 % przekracza
                # limit 100,0 %" — fabrykacja przeciazenia, nie brak danych.
                # Konsumenci grafu juz umieja czytac 0.0 jako „wielkosc nieznana,
                # kryterium niesprawdzalne": `analysis/energy_validation/builder.py`
                # (pozycja NOT_COMPUTED z powodem `POWOD_BRAK_PRADU_ZNAMIONOWEGO_PL`),
                # `application/sld/overlay_builder.py`
                # i `backend/tests/reference_networks/station_archetype_substrate.py`
                # (przeniesiony z `application/reference_networks/` karta K2,
                # 2026-09-09) bramkuja `rated > 0`. Ta sama klasa defektu zostala juz naprawiona
                # w imporcie XLSX (`application/xlsx_import/importer.py`: „ZERO
                # WARTOSCI FIKCYJNYCH … 0.0 = wielkosc nieznana") oraz w moscie
                # wejsciowym V12.6 (630 A / 300 A per aparat) — tu byla ostatnia
                # instancja klasy, na glownej sciezce ENM -> graf.
                # Scalenie z P0.1 nN: skalowanie n_parallel zostaje (rated_a_eff =
                # rated_a * n), a brak danych dalej sie propaguje (0 * n = 0).
                rated_current_a=rated_a_eff,
                # Karta F-K1 faza 3: przeniesienie danych cieplnych ZYLY FAZOWEJ do
                # grafu. Bez tego ogniwa kryterium wytrzymalosci zwarciowej przewodu
                # nie mialo w warstwie analizy z czego liczyc pradu dopuszczalnego
                # (graf nie niesie odniesienia katalogowego, a `type_ref` swiadomie
                # pozostaje niewypelniony, bo steruje precedencja impedancji).
                # Karta F-K1 faza 7: te same pola niesie juz LINIA NAPOWIETRZNA
                # (wczesniej mial je tylko kabel), wiec kryterium cieplne obejmuje
                # caly model — kable i przewody gole.
                ith_1s_a=getattr(branch, "ith_1s_a", None),
                jth_1s_a_per_mm2=getattr(branch, "jth_1s_a_per_mm2", None),
                cross_section_mm2=getattr(branch, "cross_section_mm2", None),
                # Karta F-K1 faza 6: dane materialowe zyly do UZASADNIENIA k w
                # dowodzie obliczeniowym. `getattr` z None zostaje, bo `insulation`
                # ma sens wylacznie dla kabla — przewod goly izolacji NIE MA i to
                # jest poprawna informacja, nie brak danej (patrz `conductor_kind`).
                conductor_material=getattr(branch, "conductor_material", None),
                insulation=getattr(branch, "insulation", None),
                operating_temperature_c=getattr(branch, "operating_temperature_c", None),
                short_circuit_temperature_c=getattr(branch, "short_circuit_temperature_c", None),
                thermal_source_ref=getattr(branch, "thermal_source_ref", None),
            )
            graph.add_branch(lb)

        elif isinstance(branch, SwitchBranch):
            sw_type_map = {
                "switch": SwitchType.LOAD_SWITCH,
                "breaker": SwitchType.BREAKER,
                "bus_coupler": SwitchType.LOAD_SWITCH,
                "disconnector": SwitchType.DISCONNECTOR,
            }
            sw = Switch(
                id=branch_id,
                name=nazwa_elementu(branch, "branches"),
                from_node_id=from_id,
                to_node_id=to_id,
                switch_type=sw_type_map.get(branch.type, SwitchType.LOAD_SWITCH),
                state=(SwitchState.CLOSED if branch.status == "closed" else SwitchState.OPEN),
                in_service=True,
            )
            graph.add_switch(sw)

        elif isinstance(branch, FuseBranch):
            sw = Switch(
                id=branch_id,
                name=nazwa_elementu(branch, "branches"),
                from_node_id=from_id,
                to_node_id=to_id,
                switch_type=SwitchType.FUSE,
                state=(SwitchState.CLOSED if branch.status == "closed" else SwitchState.OPEN),
                in_service=True,
                # Ta sama reguła, co przy transformatorze: rozstrzyga BRAK
                # (`is None`), nie prawdziwościowość liczby. Bezpiecznik z jawnie
                # podanym prądem znamionowym 0 A jest błędem danych, który ma
                # dojść do walidacji nietknięty — a nie zostać po drodze
                # zrównany z bezpiecznikiem bez danych.
                rated_current_a=(
                    branch.rated_current_a if branch.rated_current_a is not None else 0.0
                ),
                rated_voltage_kv=(
                    branch.rated_voltage_kv if branch.rated_voltage_kv is not None else 0.0
                ),
            )
            graph.add_switch(sw)

    # 3. Transformers → TransformerBranch (sorted by ref_id)
    for trafo in sorted(enm.transformers, key=lambda t: t.ref_id):
        hv_id = ref_to_node_id.get(trafo.hv_bus_ref)
        lv_id = ref_to_node_id.get(trafo.lv_bus_ref)
        if hv_id is None or lv_id is None:
            brakujaca = trafo.hv_bus_ref if hv_id is None else trafo.lv_bus_ref
            raise OdmowaDanychError(
                _odmowa_elementu_bez_szyny("Transformator", trafo.ref_id, brakujaca)
            )

        tap_changer = _map_tap_changer(trafo.tap_changer, ref_to_node_id)
        # G-STK-6: n identycznych jednostek równoległych → impedancja zastępcza
        # Z/n. Solver liczy Z z Sn i uk (Z = uk%·Un²/Sn), więc agregat = Sn×n daje
        # dokładnie Z/n. Domyślnie n=1 (bez zmiany dla istniejących modeli).
        # Karta CI-A (2026-09-04): JEDYNA definicja tej reguly — wspolna z
        # Cable wyzej — zyje w `enm.models.liczba_torow`.
        n_parallel = liczba_torow(trafo)
        tb = TransformerBranch(
            id=_ref_to_uuid(trafo.ref_id),
            name=nazwa_elementu(trafo, "transformers"),
            branch_type=BranchType.TRANSFORMER,
            from_node_id=hv_id,
            to_node_id=lv_id,
            in_service=True,
            rated_power_mva=trafo.sn_mva * n_parallel,
            voltage_hv_kv=trafo.uhv_kv,
            voltage_lv_kv=trafo.ulv_kv,
            uk_percent=trafo.uk_percent,
            pk_kw=trafo.pk_kw,
            # PREDYKATY `is None`, NIE prawdziwościowość liczby (karta
            # MOST-WEJSCIA-V126). Model ENM deklaruje te pola jako `float | None`,
            # a wartość domyślna należy do kontraktu `TransformerBranch` — więc
            # rolą mostu jest wyłącznie odróżnić BRAK od wartości podanej.
            # Operator `or` tego nie umiał: najostrzej przy SKOKU ZACZEPU, gdzie
            # jawnie podane 0,0 % (transformator bez regulacji zaczepowej) było
            # podmieniane na 2,5 %, czyli na regulację, której model NIE MA — a to
            # wchodzi wprost do przekładni t = 1 + poz·skok/100, czyli do rozpływu.
            i0_percent=trafo.i0_percent if trafo.i0_percent is not None else 0.0,
            p0_kw=trafo.p0_kw if trafo.p0_kw is not None else 0.0,
            vector_group=(trafo.vector_group if trafo.vector_group is not None else "Dyn11"),
            tap_position=trafo.tap_position if trafo.tap_position is not None else 0,
            tap_step_percent=(
                trafo.tap_step_percent if trafo.tap_step_percent is not None else 2.5
            ),
            tap_changer=tap_changer,
            # K_T (IEC 60909-0 eq. 12a): c_max strony dolnej z klasy tolerancji SIECI nN tej
            # strony — ten sam predykat (`enm.tolerancja_nn`), z którego węzły nN biorą c
            # (deklaracja wyspy albo wartość robocza; wejście i wyjście z jednego źródła).
            tolerancja_nn_dolna=tolerancje_nn.get(trafo.lv_bus_ref),
        )
        graph.add_branch(tb)

    # 4. Sources → zasilanie systemowe: SEM za impedancją Z_Q (IEC 60909-0 §3.2).
    #    W metodzie Z-bus to bocznik Y_Q = 1/Z_Q w węźle przyłączenia — tak samo
    #    jak maszyny wirujące (§6.3/§6.7) i tak jak stamp źródła w sieci składowej
    #    zerowej niżej w tym pliku. Wcześniej mapowanie tworzyło wirtualny węzeł
    #    ziemi i gałąź „Z_source"; szyna źródła jest jednak węzłem SLACK, a ten był
    #    w macierzy SC uziemiany admitancją idealną (1e6 pu), co ZWIERAŁO Z_Q i
    #    czyniło z niej wiszący, bezużyteczny odgałęzienie (V12K-184). Skutek:
    #    moc zwarciowa sieci zasilającej nie wchodziła do obliczeń wcale.
    #    IEC 60909: Z_Q = U_n² / Sk'' (przy napięciu szyny źródła).
    for source in sorted(enm.sources, key=lambda s: s.ref_id):
        bus_node_id = ref_to_node_id.get(source.bus_ref)
        if bus_node_id is None:
            raise OdmowaDanychError(_odmowa_zrodla_bez_szyny(source.ref_id, source.bus_ref))

        # Find bus voltage
        bus_voltage_kv = 0.0
        for bus in enm.buses:
            if bus.ref_id == source.bus_ref:
                bus_voltage_kv = bus.voltage_kv
                break
        if bus_voltage_kv <= 0:
            continue

        # Impedancja Z_Q z JEDNEGO źródła prawdy — tej samej funkcji, z której
        # korzysta sieć składowej zerowej niżej w tym pliku. Do tej karty stała tu
        # DRUGA, dosłowna kopia obliczenia (z własnym literałem R/X = 0,1): dwie
        # kopie tej samej reguły to defekt czekający na zmianę jednej z nich, a
        # różnica między nimi byłaby niewidoczna, bo obie dawały „jakąś" liczbę.
        z_ohm = _source_positive_impedance_ohm(
            source, bus_voltage_kv, scenario, tolerancja_nn=tolerancje_nn.get(source.bus_ref)
        )
        if z_ohm is None or z_ohm == 0:
            continue

        graph.add_grid_sc_source(
            GridShortCircuitSource(
                id=grid_source_graph_id(source.ref_id),
                name=nazwa_elementu(source, "sources"),
                node_id=bus_node_id,
                z_ohm=z_ohm,
            )
        )

    # 5. Generators (DER / rotating machines) → IEC 60909 SC sources (G-SCM, V12K-054).
    #    Without this the designer's PV/BESS/wind/synchronous sources contributed only
    #    P/Q to the load flow and ZERO fault current to the short circuit.
    graph.k_sc_assumptions_trace = _add_generator_sc_sources(enm, graph, ref_to_node_id)

    return graph
