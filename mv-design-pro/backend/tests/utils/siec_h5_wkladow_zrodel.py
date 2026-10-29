"""Sieć testowa karty WKLAD-ZRODLA: GPZ w układzie H5 (ENEA Operator, Zeszyt 1, §11.1).

Dwie linie zasilające 110 kV, L1 i L2, każda z własnym równoważnikiem sieci (S″k, R/X)
na własnej sekcji 110 kV; dwa transformatory 110/15 kV, każdy na własną sekcję SN; łącznik
szyn 110 kV i łącznik szyn SN. Stan łączników jest wejściem (§26.8.4 — podział planowy
wyznacza ODM/KDM), więc graf jest parametryzowany:

- ``lacznik_110kv`` / ``lacznik_sn``: zamknięty albo otwarty;
- ``liczba_zrodel``: 1 (tylko L1) albo 2 (L1 i L2); jedno źródło wymaga zamkniętego łącznika
  (inaczej sekcja B nie ma impedancji do odniesienia — macierz Y osobliwa; w toku ENM taką
  wyspę odcina assembler, rdzeń dostaje graf wyłącznie z wyspami z odniesieniem);
- ``maszyna``: generator synchroniczny na sekcji SN B;
- ``skala_zq``: mnożnik Z_Q obu równoważników (scenariusz MIN: większa impedancja).

Dane dobrane tak, by dwa źródła miały RÓŻNE impedancje i R/X (wkłady nie są symetryczne,
kąty fazorów różnią się), a transformatory przekładnie znamionowe względem baz węzłów
(110/15 kV na szynach 110/15 kV) — człony poprzeczne gałęzi są wtedy dokładnie zerowe.
Wariant ``przekladnia_poza_znamionowa`` stawia T2 na zaczepie +2 (2 × 2,5 %) — człon
poprzeczny niezerowy, bilans musi go objąć. ``b_kabla_us_per_km`` — susceptancja kabla
odejścia K1 (3 km): w modelu ENM i w rozpływie realna, w sieci zwarciowej składowej zgodnej
pominięta (karta BEZ-POJEMNOSCI), więc nie wchodzi ani do I_k'', ani do członów bilansu.
"""

from __future__ import annotations

import cmath
import math
from typing import Any

from enm.models import EnergyNetworkModel
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.grid_source import GridShortCircuitSource
from network_model.core.machine import SynchronousMachineSource
from network_model.core.node import Node, NodeType
from network_model.core.switch import Switch, SwitchState, SwitchType

from tests.catalog_test_helpers import gpz_source_record
from tests.utils.zespol_uziemiajacy import zespol_uziemiajacy_rekord

#: Moc zwarciowa i R/X równoważników torów zasilania (scenariusz MAX).
SK_L1_MVA = 3000.0
RX_L1 = 0.10
SK_L2_MVA = 2000.0
RX_L2 = 0.20
UN_WN_KV = 110.0
UN_SN_KV = 15.0
C_MAX = 1.1


def impedancja_rownowaznika_ohm(sk_mva: float, rx: float, un_kv: float = UN_WN_KV) -> complex:
    """Z_Q = c·U_n²/S″k z kątem wynikającym z R/X (IEC 60909-0:2016 eq. 6)."""
    z_abs = C_MAX * un_kv**2 / sk_mva
    x = z_abs / math.sqrt(1.0 + rx * rx)
    return complex(rx * x, x)


def _wezel(node_id: str, un_kv: float, slack: bool = False) -> Node:
    return Node(
        id=node_id,
        name=f"Szyna {node_id}",
        node_type=NodeType.SLACK if slack else NodeType.PQ,
        voltage_level=un_kv,
        active_power=0.0,
        reactive_power=0.0,
        **({"voltage_magnitude": 1.0, "voltage_angle": 0.0} if slack else {}),
    )


def _transformator(branch_id: str, od: str, do: str, tap_position: int = 0) -> TransformerBranch:
    return TransformerBranch(
        id=branch_id,
        name=f"Transformator {branch_id}",
        branch_type=BranchType.TRANSFORMER,
        from_node_id=od,
        to_node_id=do,
        in_service=True,
        rated_power_mva=25.0,
        voltage_hv_kv=UN_WN_KV,
        voltage_lv_kv=UN_SN_KV,
        uk_percent=11.0,
        pk_kw=120.0,
        i0_percent=0.0,
        p0_kw=0.0,
        vector_group="YNd11",
        tap_position=tap_position,
        tap_step_percent=2.5,
    )


def _lacznik(switch_id: str, od: str, do: str, zamkniety: bool) -> Switch:
    return Switch(
        id=switch_id,
        name=f"Łącznik szyn {switch_id}",
        from_node_id=od,
        to_node_id=do,
        switch_type=SwitchType.BREAKER,
        state=SwitchState.CLOSED if zamkniety else SwitchState.OPEN,
    )


def siec_h5(
    *,
    lacznik_110kv: bool = False,
    lacznik_sn: bool = False,
    liczba_zrodel: int = 2,
    maszyna: bool = False,
    skala_zq: float = 1.0,
    przekladnia_poza_znamionowa: bool = False,
    b_kabla_us_per_km: float = 0.0,
) -> NetworkGraph:
    """Graf H5 — węzły WN_A, WN_B (110 kV), SN_A, SN_B (15 kV) i odejście SN_A → POLE."""
    graph = NetworkGraph()
    graph.add_node(_wezel("WN_A", UN_WN_KV, slack=True))
    graph.add_node(_wezel("WN_B", UN_WN_KV, slack=liczba_zrodel == 2))
    graph.add_node(_wezel("SN_A", UN_SN_KV))
    graph.add_node(_wezel("SN_B", UN_SN_KV))
    graph.add_node(_wezel("POLE", UN_SN_KV))
    graph.add_branch(_transformator("T1", "WN_A", "SN_A"))
    graph.add_branch(
        _transformator("T2", "WN_B", "SN_B", tap_position=2 if przekladnia_poza_znamionowa else 0)
    )
    graph.add_branch(
        LineBranch(
            id="K1",
            name="Kabel odejścia",
            branch_type=BranchType.LINE,
            from_node_id="SN_A",
            to_node_id="POLE",
            r_ohm_per_km=0.125,
            x_ohm_per_km=0.11,
            b_us_per_km=b_kabla_us_per_km,
            length_km=3.0,
            rated_current_a=400.0,
        )
    )
    graph.add_switch(_lacznik("SZ_110", "WN_A", "WN_B", lacznik_110kv))
    graph.add_switch(_lacznik("SZ_SN", "SN_A", "SN_B", lacznik_sn))
    graph.add_grid_sc_source(
        GridShortCircuitSource(
            id="ZR_L1",
            name="Linia L1 110 kV",
            node_id="WN_A",
            z_ohm=impedancja_rownowaznika_ohm(SK_L1_MVA, RX_L1) * skala_zq,
        )
    )
    if liczba_zrodel == 2:
        graph.add_grid_sc_source(
            GridShortCircuitSource(
                id="ZR_L2",
                name="Linia L2 110 kV",
                node_id="WN_B",
                z_ohm=impedancja_rownowaznika_ohm(SK_L2_MVA, RX_L2) * skala_zq,
            )
        )
    if maszyna:
        graph.add_synchronous_machine_source(
            SynchronousMachineSource(
                id="GS_B",
                name="Generator synchroniczny B",
                node_id="SN_B",
                sr_mva=8.0,
                ur_kv=UN_SN_KV,
                xd_subtransient_pu=0.14,
                cos_phi_r=0.85,
            )
        )
    return graph


def fazor(modul: float, kat_deg: float | None) -> complex:
    """Fazor z modułu i kąta w stopniach (kąt ``None`` = fazor zerowy)."""
    return 0j if kat_deg is None else cmath.rect(modul, math.radians(kat_deg))


# ---------------------------------------------------------------------------
# Ta sama sieć jako model ENM — ścieżka użytkownika (API → bieg → rozpływ punktu).
# Równoważniki torów L1/L2 na szynach sekcji SN (S″k widziane na szynach SN), łącznik
# szyn jako ``bus_coupler``; maszyna synchroniczna na sekcji B, falownik PV na polu.
# ---------------------------------------------------------------------------
REF_ZRODLA_L1 = "src-l1"
REF_ZRODLA_L2 = "src-l2"
REF_GENERATORA = "gen-sg"
REF_FALOWNIKA = "gen-pv"
SK_SN_L1_MVA = 300.0
SK_SN_L2_MVA = 200.0


def _szyna_enm(numer: int, ref_id: str, nazwa: str) -> dict[str, Any]:
    return {
        "id": f"00000000-0000-0000-0000-0000000008{numer:02d}",
        "ref_id": ref_id,
        "name": nazwa,
        "tags": [],
        "meta": {},
        "voltage_kv": UN_SN_KV,
        "phase_system": "3ph",
    }


def enm_h5(
    *, lacznik_zamkniety: bool, maszyna: bool = False, falownik: bool = False
) -> EnergyNetworkModel:
    """ENM H5 (deterministyczny): sekcje A i B z własnymi zasilaniami, łącznik szyn, pole."""
    generatory: list[dict[str, Any]] = []
    if maszyna:
        generatory.append(
            {
                "id": "00000000-0000-0000-0000-000000000831",
                "ref_id": REF_GENERATORA,
                "name": "Generator synchroniczny B",
                "tags": [],
                "meta": {},
                "bus_ref": "bus-b",
                "p_mw": 4.0,
                "q_mvar": 0.0,
                "gen_type": "synchronous",
                "materialized_params": {
                    "sn_mva": 5.0,
                    "un_kv": UN_SN_KV,
                    "cos_phi": 0.8,
                    "xd_subtransient_pu": 0.15,
                },
            }
        )
    if falownik:
        generatory.append(
            {
                "id": "00000000-0000-0000-0000-000000000832",
                "ref_id": REF_FALOWNIKA,
                "name": "Farma PV",
                "tags": [],
                "meta": {},
                "bus_ref": "bus-pole",
                "p_mw": 2.0,
                "q_mvar": 0.0,
                "gen_type": "pv_inverter",
                "connection_variant": "DEDICATED_MV_CONNECTION",
                "materialized_params": {"sn_mva": 2.0, "un_kv": UN_SN_KV, "k_sc": 1.1},
            }
        )
    return EnergyNetworkModel.model_validate(
        {
            "header": {
                "name": "GPZ H5 wklady zrodel",
                "enm_version": "1.0",
                "defaults": {"frequency_hz": 50, "unit_system": "SI"},
                "created_at": "2024-01-01T00:00:00Z",
                "updated_at": "2024-01-01T00:00:00Z",
                "revision": 1,
                "hash_sha256": "",
            },
            "buses": [
                _szyna_enm(1, "bus-a", "Sekcja A SN"),
                _szyna_enm(2, "bus-b", "Sekcja B SN"),
                _szyna_enm(3, "bus-pole", "Szyna pola"),
            ],
            "branches": [
                {
                    "id": "00000000-0000-0000-0000-000000000811",
                    "ref_id": "kabel-pole",
                    "name": "Kabel pola",
                    "tags": [],
                    "meta": {},
                    "type": "cable",
                    "from_bus_ref": "bus-a",
                    "to_bus_ref": "bus-pole",
                    "status": "closed",
                    "catalog_ref": "KABEL_SN_TEST",
                    "parameter_source": "CATALOG",
                    "length_km": 2.0,
                    "r_ohm_per_km": 0.253,
                    "x_ohm_per_km": 0.073,
                    "b_siemens_per_km": 0.0,
                    "r0_ohm_per_km": 3 * 0.253,
                    "x0_ohm_per_km": 3 * 0.073,
                    "b0_siemens_per_km": 0.0,
                    "rating": {"in_a": 270.0},
                },
                {
                    "id": "00000000-0000-0000-0000-000000000812",
                    "ref_id": "sprzeglo-sn",
                    "name": "Sprzęgło szyn SN",
                    "tags": [],
                    "meta": {},
                    "type": "bus_coupler",
                    "from_bus_ref": "bus-a",
                    "to_bus_ref": "bus-b",
                    "status": "closed" if lacznik_zamkniety else "open",
                },
            ],
            "sources": [
                {
                    "id": "00000000-0000-0000-0000-000000000821",
                    "tags": [],
                    "meta": {},
                    **gpz_source_record(
                        ref_id=REF_ZRODLA_L1,
                        name="Tor zasilania L1",
                        bus_ref="bus-a",
                        voltage_kv=UN_SN_KV,
                        sk3_mva=SK_SN_L1_MVA,
                        rx_ratio=RX_L1,
                    ),
                },
                {
                    "id": "00000000-0000-0000-0000-000000000822",
                    "tags": [],
                    "meta": {},
                    **gpz_source_record(
                        ref_id=REF_ZRODLA_L2,
                        name="Tor zasilania L2",
                        bus_ref="bus-b",
                        voltage_kv=UN_SN_KV,
                        sk3_mva=SK_SN_L2_MVA,
                        rx_ratio=RX_L2,
                    ),
                },
            ],
            # Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA: uziemienie punktu neutralnego sieci SN niesie
            # zespół uziemiający sekcji (rezystor, Z.15) — równoważnik SN nie ma Z0 (dawniej
            # ``z0_z1_ratio`` torów zasilania udawał drogę zerową przez źródło SN).
            "zespoly_uziemiajace": [
                zespol_uziemiajacy_rekord("zu-a", "bus-a"),
                zespol_uziemiajacy_rekord("zu-b", "bus-b"),
            ],
            "loads": [],
            "transformers": [],
            "generators": generatory,
            "substations": [],
            "bays": [],
            "junctions": [],
            "corridors": [],
            "measurements": [],
            "protection_assignments": [],
            "branch_points": [],
        }
    )
