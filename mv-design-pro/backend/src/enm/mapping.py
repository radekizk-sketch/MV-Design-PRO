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
from typing import Any, Literal

import numpy as np
from network_model.catalog.types import ConverterKind
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
from network_model.core.machine import AsynchronousMachineSource, SynchronousMachineSource
from network_model.core.node import Node, NodeType
from network_model.core.switch import Switch, SwitchState, SwitchType
from network_model.core.voltage_factor import c_for_node
from network_model.core.ybus import AdmittanceMatrixBuilder
from network_model.pochodne import (
    impedancja_z_napiecia_i_mocy_ohm,
    prad_znamionowy_a,
)
from network_model.solvers.power_flow_zip import (
    ZipCoeffs,
    aggregate_zip,
    zip_coeffs_from_materialized_params,
)

from .models import (
    Cable,
    EnergyNetworkModel,
    FuseBranch,
    Generator,
    OverheadLine,
    Source,
    SwitchBranch,
    liczba_torow,
)
from .models import TapChanger as EnmTapChanger


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


def impedancja_zrodla_sieciowego(
    source: Source, bus_voltage_kv: float
) -> tuple[complex, dict[str, Any]] | None:
    """Impedancja zgodna zasilania systemowego Z_Q [Ω] + ślad WHITE BOX wyprowadzenia.

    IEC 60909-0:2016 §6.2.1 eq. (6): Z_Q = c·U_nQ / (√3·I''_kQ) = c·U_nQ²/S''_kQ —
    współczynnik napięciowy c (Tab. 1, pasmo napięcia węzła przyłączenia Q,
    ``c_for_node``) jest CZĘŚCIĄ definicji impedancji zastępczej sieci zasilającej,
    bo deklarowana przez OSD moc zwarciowa S''_kQ została policzona ze źródłem
    zastępczym c·U_nQ/√3 za tą impedancją. Bez c (stan do CV-4.3 K6, 2026-09-06)
    prąd zwarciowy w samym węźle przyłączenia wychodził c·I''_kQ — o 10 % (SN/WN)
    lub 5 % (nN) ponad wartość deklarowaną; po K6 bieg w węźle przyłączenia odtwarza I''_kQ
    dokładnie (test ``tests/enm/test_z_q_wspolczynnik_c.py``).

    c = c_max pasma U_nQ ZAWSZE — także dla studium MIN: Z_Q jest własnością sieci
    zasilającej wyprowadzoną z JEDYNEJ deklarowanej danej (S''_kQmax); c_min wchodzi
    wyłącznie do źródła napięciowego w węźle zwarcia (assembler/solver). Literalne
    c_min·U²/S''_kQmax dałoby Ik''min(węzeł przyłączenia) = I''_kQmax (niekonserwatywnie dla
    czułości zabezpieczeń). Model z S''_kQmin — karta K7.

    Tryb ``r_ohm``/``x_ohm`` (impedancja jawna) = impedancja fizyczna z modelu, bez c.
    ``None`` znaczy „źródło nie ma z czego policzyć impedancji" (brak jawnego R/X
    i brak mocy zwarciowej) — wołający POMIJA takie źródło, zamiast wstawiać za
    nie liczbę.
    """
    if source.r_ohm is not None and source.x_ohm is not None:
        z_ohm = complex(source.r_ohm, source.x_ohm)
        return z_ohm, {
            "ref_id": source.ref_id,
            "tryb": "IMPEDANCJA_JAWNA",
            "u_nq_kv": bus_voltage_kv,
            "z_q_ohm": {"re": z_ohm.real, "im": z_ohm.imag},
            "formula": "Z_Q = R_Q + jX_Q (impedancja jawna z modelu, bez c)",
        }
    if source.sk3_mva is None or source.sk3_mva <= 0:
        return None
    c_max = c_for_node(bus_voltage_kv, "MAX")
    z_abs = c_max * impedancja_z_napiecia_i_mocy_ohm(bus_voltage_kv, source.sk3_mva)
    rx_z_modelu = source.rx_ratio is not None and source.rx_ratio > 0
    rx: float = (
        source.rx_ratio
        if source.rx_ratio is not None and source.rx_ratio > 0
        else _IEC60909_RX_ZASILANIA_SYSTEMOWEGO
    )
    x_ohm = z_abs / math.sqrt(1.0 + rx**2)
    r_ohm = x_ohm * rx
    z_ohm = complex(r_ohm, x_ohm)
    return z_ohm, {
        "ref_id": source.ref_id,
        "tryb": "MOC_ZWARCIOWA",
        "u_nq_kv": bus_voltage_kv,
        "sk3_mva": source.sk3_mva,
        "c": c_max,
        "pasmo_c": "nN" if bus_voltage_kv <= 1.0 else "SN/WN",
        "rx_ratio": rx,
        "rx_ratio_zrodlo": "MODEL" if rx_z_modelu else "IEC_60909_DOMYSLNY_0_1",
        "z_q_abs_ohm": z_abs,
        "z_q_ohm": {"re": z_ohm.real, "im": z_ohm.imag},
        "formula": (
            "Z_Q = c_max·U_nQ²/S''_kQ (IEC 60909-0:2016 §6.2.1 eq. 6); "
            "X_Q = Z_Q/√(1+(R/X)²); R_Q = X_Q·(R/X)"
        ),
    }


def _source_positive_impedance_ohm(source: Source, bus_voltage_kv: float) -> complex | None:
    """Impedancja zgodna Z_Q [Ω] albo ``None`` — patrz ``impedancja_zrodla_sieciowego``."""
    wynik = impedancja_zrodla_sieciowego(source, bus_voltage_kv)
    return None if wynik is None else wynik[0]


def _source_zero_impedance_ohm(source: Source, bus_voltage_kv: float) -> complex | None:
    if source.r0_ohm is not None and source.x0_ohm is not None:
        return complex(source.r0_ohm, source.x0_ohm)
    if source.z0_z1_ratio is None or source.z0_z1_ratio <= 0:
        return None
    z1 = _source_positive_impedance_ohm(source, bus_voltage_kv)
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
    if z_ohm == 0:
        raise ZeroDivisionError("Cannot compute zero-sequence admittance: impedance is zero")
    z_pu = z_ohm / z_base_ohm
    y_series_pu = 1.0 / z_pu
    y_bus[from_idx, to_idx] -= y_series_pu
    y_bus[to_idx, from_idx] -= y_series_pu
    y_bus[from_idx, from_idx] += y_series_pu
    y_bus[to_idx, to_idx] += y_series_pu


def _assemble_zero_sequence_y0(
    enm: EnergyNetworkModel, graph: NetworkGraph
) -> tuple[AdmittanceMatrixBuilder, dict[str, int], int, np.ndarray, list[dict]]:
    """Składa macierz Y0 (składowej zerowej) z pól ENM + ślad WHITE BOX.

    Rozbicie po elementach (linie/kable, źródła, transformatory wg grupy
    połączeń) — kolejność deterministyczna (sort po ref_id). Transformatory
    stampowane wg tablicy połączeń sekwencji zerowej (SM-3, V12K-181):
    grupa wektorowa + uziemienie punktów neutralnych decydują o ciągłości /
    przerwie / boczniku do ziemi prądu zerowego.
    """
    from network_model.whitebox.tracer import WhiteBoxTracer

    from .zero_sequence_transformer import (
        ZeroSeqConnection,
        build_transformer_zero_seq_model,
    )

    builder = AdmittanceMatrixBuilder(graph)
    builder.build()
    node_index = builder.node_id_to_index
    size = len(set(node_index.values()))
    y0_bus = np.zeros((size, size), dtype=complex)
    tracer = WhiteBoxTracer()

    ref_to_node_id = {bus.ref_id: _ref_to_uuid(bus.ref_id) for bus in enm.buses}
    bus_voltage = {bus.ref_id: bus.voltage_kv for bus in enm.buses}

    for branch in sorted(enm.branches, key=lambda b: b.ref_id):
        if not isinstance(branch, OverheadLine | Cable):
            continue
        if branch.status != "closed":
            continue
        if branch.r0_ohm_per_km is None or branch.x0_ohm_per_km is None:
            continue

        from_id = ref_to_node_id.get(branch.from_bus_ref)
        to_id = ref_to_node_id.get(branch.to_bus_ref)
        if from_id not in node_index or to_id not in node_index:
            continue
        from_idx = node_index[from_id]
        to_idx = node_index[to_id]
        z0_ohm = complex(branch.r0_ohm_per_km, branch.x0_ohm_per_km) * branch.length_km
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
            title=f"Gałąź {branch.name or branch.ref_id}: impedancja zerowa (szeregowa)",
            formula_latex=r"Z_{0,line} = (r_0 + jx_0)\cdot \ell",
            inputs={
                "ref_id": branch.ref_id,
                "r0_ohm_per_km": branch.r0_ohm_per_km,
                "x0_ohm_per_km": branch.x0_ohm_per_km,
                "length_km": branch.length_km,
            },
            substitution=f"Z0 = {z0_ohm.real:.6g} + j{z0_ohm.imag:.6g} Ω (szereg {from_id}↔{to_id})",
            result={"z0_ohm": z0_ohm},
        )

        # Audyt fizyki fala F (V12K): pojemność doziemna linii/kabla (B0) jako
        # bocznik do ziemi w modelu π (jak susceptancja zgodna w Y1 — patrz
        # AdmittanceMatrixBuilder._get_branch_admittances_pu, split /2 na
        # każdy koniec). Przed tą kartą B0 było CAŁKOWICIE pomijane w sieci
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
            tracer.add(
                key=f"z0_line_shunt[{branch.ref_id}]",
                title=(
                    f"Gałąź {branch.name or branch.ref_id}: pojemność doziemna "
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
                    f"{y0_shunt_total_s:.6g} S; Y0_sh,end(pu) = "
                    f"j{y0_shunt_per_end_pu.imag:.6g} (na {from_id} i {to_id})"
                ),
                result={"y0_shunt_per_end_pu": y0_shunt_per_end_pu},
            )

    for source in sorted(enm.sources, key=lambda s: s.ref_id):
        bus_id = ref_to_node_id.get(source.bus_ref)
        if bus_id not in node_index:
            raise ValueError(_odmowa_zrodla_bez_szyny(source.ref_id, source.bus_ref))
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
                    f"Źródło {source.name or source.ref_id}: pominięte w Y0 "
                    "(brak napięcia szyny)"
                ),
                formula_latex=r"\text{brak } U_n(\mathrm{bus})",
                inputs={"ref_id": source.ref_id, "bus_ref": source.bus_ref},
                substitution=(
                    "Szyna źródła nie ma zarejestrowanego napięcia znamionowego — "
                    "pominięto wkład do macierzy Y0."
                ),
                result={},
                notes="OSTRZEZENIE: brak napiecia szyny zrodla w sieci skladowej zerowej.",
            )
            continue
        bus_voltage_kv = bus_voltage[source.bus_ref]
        if bus_voltage_kv <= 0:
            continue
        # Wlasna nazwa (nie `z0_ohm` z petli galeziowej wyzej): tam wartosc jest
        # ZAWSZE zespolona, tu MOZE byc None (zrodlo bez danych skladowej zerowej).
        # Wspoldzielenie jednej nazwy chowalo te roznice przed analiza typow.
        z0_source_ohm = _source_zero_impedance_ohm(source, bus_voltage_kv)
        if z0_source_ohm is None:
            continue
        if z0_source_ohm == 0:
            raise ZeroDivisionError(
                "Cannot compute source zero-sequence admittance: impedance is zero"
            )
        idx = node_index[bus_id]
        y0_bus[idx, idx] += 1.0 / (z0_source_ohm / builder.get_zbase_ohm(bus_id))
        tracer.add(
            key=f"z0_source[{source.ref_id}]",
            title=f"Źródło {source.name or source.ref_id}: impedancja zerowa (bocznik do ziemi)",
            formula_latex=r"Y_{0,src} = 1 / (Z_{0,src}/Z_{base})",
            inputs={"ref_id": source.ref_id, "z0_ohm": z0_source_ohm},
            substitution=(
                f"Z0(src) = {z0_source_ohm.real:.6g} + j{z0_source_ohm.imag:.6g} Ω "
                f"(bocznik {bus_id})"
            ),
            result={"z0_ohm": z0_source_ohm},
        )

    # SM-3 (V12K-181): transformatory w sieci składowej zerowej wg grupy połączeń.
    # Przed tą kartą całkowicie pomijane — grupa wektorowa nie sterowała ścieżką
    # I0. Stamp: SERIES_THROUGH → gałąź HV↔LV; HV/LV_SHUNT_GROUND → bocznik do
    # ziemi na danym zacisku; OPEN → brak wkładu (droga zablokowana, np. trójkąt).
    transformer_trace: list[dict] = []
    for trafo in sorted(enm.transformers, key=lambda t: t.ref_id):
        hv_id = ref_to_node_id.get(trafo.hv_bus_ref)
        lv_id = ref_to_node_id.get(trafo.lv_bus_ref)
        if hv_id not in node_index or lv_id not in node_index:
            continue
        model = build_transformer_zero_seq_model(trafo)
        transformer_trace.extend(model.trace)
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
        elif model.connection == ZeroSeqConnection.LV_SHUNT_GROUND:
            y0_bus[node_index[lv_id], node_index[lv_id]] += y_pu

    # Zero-sequence paths can be intentionally blocked by transformer vector
    # groups. Such nodes are uncoupled in Z0 and must not make SN-side 1F/2F+G
    # calculations singular; adding a local numerical reference keeps them
    # isolated from the solved SN network.
    for idx in range(size):
        if np.allclose(y0_bus[idx, :], 0.0) and np.allclose(y0_bus[:, idx], 0.0):
            y0_bus[idx, idx] += complex(1e6, 0.0)

    return builder, node_index, size, y0_bus, tracer.to_list() + transformer_trace


def build_zero_sequence_zbus(enm: EnergyNetworkModel, graph: NetworkGraph) -> np.ndarray:
    """
    Build the zero-sequence Z-bus from ENM fields without mutating the graph.

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
    """
    _, _, size, y0_bus, _ = _assemble_zero_sequence_y0(enm, graph)
    if np.linalg.matrix_rank(y0_bus) < size:
        raise ValueError(
            "Zero-sequence Y-bus is singular; cannot compute Z0-bus "
            "(sieć bez drogi powrotu prądu zerowego do ziemi — brak uziemienia "
            "punktu neutralnego i brak pojemności doziemnej B0 na liniach/kablach; "
            "dla sieci izolowanej podaj b0_siemens_per_km, by uwzględnić prąd "
            "pojemnościowy doziemienia)"
        )
    try:
        return np.linalg.inv(y0_bus)
    except np.linalg.LinAlgError as exc:
        raise ValueError("Zero-sequence Y-bus is singular; cannot compute Z0-bus") from exc


def build_zero_sequence_trace(enm: EnergyNetworkModel, graph: NetworkGraph) -> list[dict]:
    """Ślad WHITE BOX budowy sieci składowej zerowej — rozbicie po elementach
    (linie/kable, źródła, transformatory z decyzją grupy połączeń). ADDYTYWNE."""
    _, _, _, _, trace = _assemble_zero_sequence_y0(enm, graph)
    return trace


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
# gen_type → wind_type_3 flag (DFIG crowbar relabelling; §6.7 math unchanged).
_ASYNC_GEN_TYPES: dict[str, bool] = {
    "fw_dfig": True,  # Type 3 DFIG: crowbar → induction machine
    "fw_scig": False,  # squirrel-cage induction generator
}


def _gen_quantity(gen: Generator) -> int:
    """Number of parallel units the generator element represents (≥ 1).

    ``quantity`` (explicit unit count) takes priority over ``n_parallel``
    (identical-units-in-parallel neutral-element reading via
    ``enm.models.liczba_torow`` — karta CI-A 2026-09-04, jedyna definicja tej
    reguly, wspolna z Cable/Transformer wyzej w tym pliku).
    """
    q = gen.quantity or liczba_torow(gen)
    return q if q >= 1 else 1


def _gen_rated_apparent_mva(
    gen: Generator, mp: dict, *, cos_phi_fallback: float = 1.0
) -> float | None:
    """Total rated apparent power S_r [MVA] of the installation for SC.

    Prefers the catalog per-unit ``sn_mva`` × parallel count; otherwise falls back
    to |p_mw|/cosφ (|p_mw| is already the installation total). Returns None when no
    positive rating can be established (→ the source is skipped, never fabricated).
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
    cf = cos_phi_fallback if cos_phi_fallback and cos_phi_fallback > 0 else 1.0
    return p / cf


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
    voltage). The decay/reactance factor x″d uses the domain models' documented
    IEC-typical default (``core/machine.py``) — WHITE BOX, the same defaulting
    pattern as the external-source ``rx`` ratio.

    ``k_sc`` (udział zwarciowy falownika wg IEC 60909) — karta FAB-H (naprawa
    znaleziska FAB-D1/D7): katalog konwertera (``ConverterType``/``PVInverterType``/
    ``BESSInverterType``) MOŻE nieść ``k_sc`` z karty producenta (odczytany tu z
    ``materialized_params["k_sc"]``). Gdy karta go NIE niesie, przyjmuje się IEC
    1,1 jako ZAREJESTROWANE ZAŁOŻENIE — nie cichy numer: ``InverterSource.k_sc_zrodlo``
    (IR, ``core/inverter.py``) niesie proweniencję ("KATALOG"/"ZALOZENIE"), a ta
    funkcja zwraca ślad WHITE BOX (jeden wpis na każde takie założenie) surowany
    przez wywołującego na ``graph.k_sc_assumptions_trace``; gotowość zgłasza WARNING
    ``inverter.k_sc_assumed`` (`application/calculation_readiness/service.py`). Sieć
    bez k_sc w KAŻDEJ karcie daje DOKŁADNIE ten sam wynik zwarciowy co przed tą
    kartą (1,1) — zmienia się wyłącznie proweniencja i ślad, nigdy liczba.
    Deterministic: iteration is id-sorted and each source id is the generator ref_id.
    A no-op when there are no generators, so machine-free networks keep a
    byte-identical SC Y-bus (the ybus machine shunt / inverter superposition are
    themselves no-ops without sources).

    Returns:
        WHITE BOX trace entries (possibly empty) — one per generator whose k_sc
        was a REGISTERED ASSUMPTION (catalog card silent on k_sc), sorted by
        generator ref_id (same determinism as the generator iteration above).
    """
    from network_model.whitebox.tracer import WhiteBoxTracer

    tracer = WhiteBoxTracer()
    bus_voltage_by_ref = {b.ref_id: b.voltage_kv for b in enm.buses}
    for gen in sorted(enm.generators, key=lambda g: g.ref_id):
        gen_type = gen.gen_type
        if gen_type is None:
            continue
        node_id = ref_to_node_id.get(gen.bus_ref)
        if node_id is None:
            continue
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
            if (
                isinstance(k_sc_raw, int | float)
                and not isinstance(k_sc_raw, bool)
                and k_sc_raw > 0
            ):
                k_sc_value = float(k_sc_raw)
                k_sc_zrodlo: Literal["KATALOG", "ZALOZENIE"] = "KATALOG"
            else:
                k_sc_value = 1.1
                k_sc_zrodlo = "ZALOZENIE"
                tracer.add(
                    key=f"k_sc_zalozenie_{gen.ref_id}",
                    title="Założenie: udział zwarciowy falownika k_sc",
                    formula_latex=r"I_k = k_{sc} \cdot I_n",
                    inputs={
                        "generator_ref": gen.ref_id,
                        "catalog_ref": gen.catalog_ref,
                    },
                    substitution=(
                        "k_sc = 1,1 przyjęte — brak danych karty katalogowej konwertera "
                        f"{gen.catalog_ref or '(brak referencji katalogowej)'}"
                    ),
                    result={"k_sc": k_sc_value},
                    notes=(
                        "ZAREJESTROWANE ZAŁOŻENIE (karta FAB-H): karta katalogowa "
                        "konwertera nie niesie k_sc — przyjęto wartość domyślną IEC "
                        "60909 (1,1). Wpisz k_sc w karcie katalogowej, aby zastąpić "
                        "założenie zmierzoną wartością producenta."
                    ),
                )
            graph.add_inverter_source(
                InverterSource(
                    id=gen.ref_id,
                    name=gen.name,
                    node_id=node_id,
                    type_ref=gen.catalog_ref,
                    converter_kind=FULL_CONVERTER_SC_GEN_TYPES[gen_type],
                    in_rated_a=in_rated_a,
                    k_sc=k_sc_value,
                    k_sc_zrodlo=k_sc_zrodlo,
                    contributes_negative_sequence=True,
                    contributes_zero_sequence=False,
                )
            )
        elif gen_type == "synchronous":
            cos_phi = mp.get("cos_phi") or mp.get("cos_phi_r")
            cos_phi_r = (
                float(cos_phi) if isinstance(cos_phi, int | float) and 0 < cos_phi <= 1 else 0.8
            )
            sr_mva = _gen_rated_apparent_mva(gen, mp, cos_phi_fallback=cos_phi_r)
            if sr_mva is None or sr_mva <= 0:
                continue
            xd = mp.get("xd_subtransient_pu")
            sync_kwargs: dict = {
                "id": gen.ref_id,
                "name": gen.name,
                "node_id": node_id,
                "sr_mva": sr_mva,
                "ur_kv": un_kv,
                "cos_phi_r": cos_phi_r,
            }
            if isinstance(xd, int | float) and xd > 0:
                sync_kwargs["xd_subtransient_pu"] = float(xd)
            graph.add_synchronous_machine_source(SynchronousMachineSource(**sync_kwargs))
        elif gen_type in _ASYNC_GEN_TYPES:
            # Rated mechanical power P_rM is approximated by the electrical |p_mw|
            # (they differ by η·cosφ). Acceptable for F1 with IEC-typical model
            # defaults; a dedicated catalog nameplate (P_rM, I_LR, pole pairs) is
            # F-follow. AsynchronousMachineSource derives S_rM = P_rM/(η·cosφ).
            pr_mw = abs(gen.p_mw)
            if pr_mw <= 0:
                continue
            i_lr = mp.get("i_lr_ratio")
            async_kwargs: dict = {
                "id": gen.ref_id,
                "name": gen.name,
                "node_id": node_id,
                "pr_mw": pr_mw,
                "ur_kv": un_kv,
                "wind_type_3": _ASYNC_GEN_TYPES[gen_type],
            }
            if isinstance(i_lr, int | float) and i_lr > 0:
                async_kwargs["i_lr_ratio"] = float(i_lr)
            graph.add_asynchronous_machine_source(AsynchronousMachineSource(**async_kwargs))

    return tracer.to_list()


def build_inverter_k_sc_trace(enm: EnergyNetworkModel) -> list[dict]:
    """Ślad WHITE BOX zarejestrowanych założeń k_sc (udziału zwarciowego falownika).

    Karta FAB-H — ten sam wzorzec co ``build_zero_sequence_trace`` powyżej: funkcja
    publiczna, wywoływalna niezależnie od pełnego biegu SC, do wglądu/testów w ślad
    założeń bez konieczności uruchamiania solvera. Pusta lista, gdy każdy konwerter
    ma jawne ``k_sc`` w karcie katalogowej (albo gdy sieć nie ma konwerterów).
    """
    return map_enm_to_network_graph(enm).k_sc_assumptions_trace


def build_grid_source_trace(enm: EnergyNetworkModel) -> list[dict[str, Any]]:
    """Ślad WHITE BOX wyprowadzenia Z_Q każdego źródła sieciowego (CV-4.3 K6).

    Ten sam wzorzec co ``build_inverter_k_sc_trace``: funkcja publiczna, do wglądu
    bez biegu solvera; jeden wpis na źródło z policzalną impedancją (tryb mocy
    zwarciowej z c wg IEC 60909-0 eq. (6) albo impedancja jawna), w kolejności
    ``ref_id`` źródeł. Źródło bez danych (``None``) nie ma wpisu — tak samo jak nie
    ma bocznika Y_Q w grafie (``map_enm_to_network_graph``): jeden predykat.
    """
    napiecie = {bus.ref_id: bus.voltage_kv for bus in enm.buses}
    slad: list[dict[str, Any]] = []
    for source in sorted(enm.sources, key=lambda s: s.ref_id):
        u_kv = napiecie.get(source.bus_ref, 0.0)
        if u_kv <= 0:
            continue
        wynik = impedancja_zrodla_sieciowego(source, u_kv)
        if wynik is None or wynik[0] == 0:
            continue
        slad.append(wynik[1])
    return slad


def map_enm_to_network_graph(enm: EnergyNetworkModel) -> NetworkGraph:
    """
    Map ENM to NetworkGraph consumed by existing solvers.

    This is a pure, deterministic function: same ENM → same NetworkGraph.
    """
    graph = NetworkGraph()

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
    for load in enm.loads:
        bus_p[load.bus_ref] = bus_p.get(load.bus_ref, 0.0) - load.p_mw
        bus_q[load.bus_ref] = bus_q.get(load.bus_ref, 0.0) - load.q_mvar
        bus_load_p[load.bus_ref] = bus_load_p.get(load.bus_ref, 0.0) - load.p_mw
        bus_load_q[load.bus_ref] = bus_load_q.get(load.bus_ref, 0.0) - load.q_mvar
        bus_zip_components.setdefault(load.bus_ref, []).append(
            (
                load.p_mw,
                load.q_mvar,
                zip_coeffs_from_materialized_params(load.materialized_params),
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
        if str(meta.get("control_mode") or "").strip() != "REGULACJA_NAPIECIA":
            continue
        if gen.bus_ref in bus_voltage_control_gen_ref:
            raise ValueError(
                f"Szyna '{gen.bus_ref}' ma więcej niż jeden generator w trybie "
                f"regulacji napięcia ('{bus_voltage_control_gen_ref[gen.bus_ref]}' i "
                f"'{gen.ref_id}') — kontrakt rozpływu dopuszcza jedną nastawę "
                "napięcia na węzeł."
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
                raise ValueError(
                    f"Szyna bilansująca '{bus.ref_id}' nie może być jednocześnie "
                    f"węzłem regulacji napięcia generatora "
                    f"'{bus_voltage_control_gen_ref[bus.ref_id]}' — szyna SLACK ma "
                    "już zadane napięcie źródła zasilania."
                )
            node = Node(
                id=node_id,
                name=bus.name,
                node_type=NodeType.SLACK,
                voltage_level=bus.voltage_kv,
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
                name=bus.name,
                node_type=NodeType.PV,
                voltage_level=bus.voltage_kv,
                voltage_magnitude=bus_voltage_control[bus.ref_id],
                active_power=p,
                reactive_power=q if q != 0.0 else None,
            )
        else:
            node = Node(
                id=node_id,
                name=bus.name,
                node_type=NodeType.PQ,
                voltage_level=bus.voltage_kv,
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
            continue

        branch_id = _ref_to_uuid(branch.ref_id)

        if isinstance(branch, OverheadLine | Cable):
            b_us_per_km = 0.0
            if branch.b_siemens_per_km is not None:
                b_us_per_km = branch.b_siemens_per_km * 1e6  # S/km → μS/km

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
                name=branch.name,
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
                # (pozycja NOT_COMPUTED „Brak pradu znamionowego galezi"),
                # `analysis/power_flow/analysis.py`, `application/sld/overlay_builder.py`
                # i `application/reference_networks/station_archetype_substrate.py`
                # bramkuja `rated > 0`. Ta sama klasa defektu zostala juz naprawiona
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
                name=branch.name,
                from_node_id=from_id,
                to_node_id=to_id,
                switch_type=sw_type_map.get(branch.type, SwitchType.LOAD_SWITCH),
                state=SwitchState.CLOSED if branch.status == "closed" else SwitchState.OPEN,
                in_service=True,
            )
            graph.add_switch(sw)

        elif isinstance(branch, FuseBranch):
            sw = Switch(
                id=branch_id,
                name=branch.name,
                from_node_id=from_id,
                to_node_id=to_id,
                switch_type=SwitchType.FUSE,
                state=SwitchState.CLOSED if branch.status == "closed" else SwitchState.OPEN,
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
            continue

        tap_changer = _map_tap_changer(trafo.tap_changer, ref_to_node_id)
        # G-STK-6: n identycznych jednostek równoległych → impedancja zastępcza
        # Z/n. Solver liczy Z z Sn i uk (Z = uk%·Un²/Sn), więc agregat = Sn×n daje
        # dokładnie Z/n. Domyślnie n=1 (bez zmiany dla istniejących modeli).
        # Karta CI-A (2026-09-04): JEDYNA definicja tej reguly — wspolna z
        # Cable wyzej — zyje w `enm.models.liczba_torow`.
        n_parallel = liczba_torow(trafo)
        tb = TransformerBranch(
            id=_ref_to_uuid(trafo.ref_id),
            name=trafo.name,
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
            vector_group=trafo.vector_group if trafo.vector_group is not None else "Dyn11",
            tap_position=trafo.tap_position if trafo.tap_position is not None else 0,
            tap_step_percent=(
                trafo.tap_step_percent if trafo.tap_step_percent is not None else 2.5
            ),
            tap_changer=tap_changer,
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
            raise ValueError(_odmowa_zrodla_bez_szyny(source.ref_id, source.bus_ref))

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
        z_ohm = _source_positive_impedance_ohm(source, bus_voltage_kv)
        if z_ohm is None or z_ohm == 0:
            continue

        graph.add_grid_sc_source(
            GridShortCircuitSource(
                id=_ref_to_uuid(f"_zsrc_{source.ref_id}"),
                name=source.name or source.ref_id,
                node_id=bus_node_id,
                z_ohm=z_ohm,
            )
        )

    # 5. Generators (DER / rotating machines) → IEC 60909 SC sources (G-SCM, V12K-054).
    #    Without this the designer's PV/BESS/wind/synchronous sources contributed only
    #    P/Q to the load flow and ZERO fault current to the short circuit.
    graph.k_sc_assumptions_trace = _add_generator_sc_sources(enm, graph, ref_to_node_id)

    return graph
