"""Defekt B (PRZEGLAD_FALI_2026-08-01, klaster B): moc bierna wytworcy liczona
z WLASNEJ mocy zrodla, a nie z mocy zadanej szyny.

Dowod na PRODUKCYJNEJ sciezce (``create_run``/``execute_run``), nie na samej
funkcji solvera. Szyna prosumencka SN 15 kV: odbior 3,0 MW / 1,5 Mvar ORAZ
wytworca z regulacja stalego wspolczynnika mocy (cos fi = 0,95, nadwzbudzony) na
TEJ SAMEJ szynie; zasilanie z GPZ linia 12 km 0,4 + j0,8 om/km, S_b = 10 MVA.

Model wiazacy (kanon fizyczny):

    P_szyny(V) = -P_odb * f_ZIP(V) + P_zrodla
    Q_szyny(V) = -Q_odb * f_ZIP(V) + tan(arccos cos fi) * P_zrodla

Przed naprawa ``apply_inverter_setpoint`` czytal ``p_spec[idx]`` jako moc
falownika. Po naprawie defektu D1 jest to baza ODBIOROWA, wiec wytworca liczyl
swoja moc bierna z mocy ODBIORU, a przypisanie ``q_spec[idx] = ...`` kasowalo
zapotrzebowanie bierne odbioru z modelu. Skutek na przylaczu: ODWROCONY znak Q.

Odniesienie liczbowe pochodzi z NIEZALEZNEGO Newtona liczonego w tym pliku w
czystym numpy — bez uzycia badanego solvera.

ILOCZYN CECH (regula KLASA, NIE INSTANCJA §2): {odbior ZIP, odbior stalomocowy}
x {cos fi, moc bierna zadana} na produkcyjnej sciezce; wariant bez regulacji jest
sedzia kontrolnym (determinizm istniejacych migawek).
"""

from __future__ import annotations

import math

import numpy as np
import pytest
from enm.assembler import (
    _graph_id_from_ref,
)
from enm.canonical_analysis import (
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.models import EnergyNetworkModel
from enm.store import reset_enm_store, set_enm
from enm.validator import ENMValidator

from tests.catalog_test_helpers import gpz_source_record

BASE_MVA = 10.0
U_KV = 15.0
LINE_KM = 12.0
R_OHM_KM = 0.4
X_OHM_KM = 0.8
P_LOAD_MW = 3.0
Q_LOAD_MVAR = 1.5
P_GEN_MW = 2.0
COS_PHI = 0.95
TAN_PHI = math.tan(math.acos(COS_PHI))

# Charakterystyka stalej impedancji — wielomian, ktory realnie zmienia wartosci
# (przy stalej mocy defekt tez strzela, ale bez udzialu wielomianu).
ZIP_STALA_IMPEDANCJA = {
    "a_p": 1.0,
    "b_p": 0.0,
    "c_p": 0.0,
    "a_q": 1.0,
    "b_q": 0.0,
    "c_q": 0.0,
    "v0_pu": 1.0,
}


def _payload(name: str, *, meta: dict, zip_load: bool) -> dict:
    load: dict = {
        "id": "00000000-0000-0000-0000-000000000020",
        "ref_id": "load-1",
        "name": "Odbior zakladu",
        "tags": [],
        "meta": {},
        "bus_ref": "b2",
        "p_mw": P_LOAD_MW,
        "q_mvar": Q_LOAD_MVAR,
    }
    if zip_load:
        load["model"] = "zip"
        load["materialized_params"] = dict(ZIP_STALA_IMPEDANCJA)
    return {
        "header": {
            "name": name,
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "revision": 1,
            "hash_sha256": "",
        },
        "buses": [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "ref_id": "b1",
                "name": "GPZ",
                "tags": [],
                "meta": {},
                "voltage_kv": U_KV,
                "phase_system": "3ph",
            },
            {
                "id": "00000000-0000-0000-0000-000000000002",
                "ref_id": "b2",
                "name": "Zaklad",
                "tags": [],
                "meta": {},
                "voltage_kv": U_KV,
                "phase_system": "3ph",
            },
        ],
        "branches": [
            {
                "id": "00000000-0000-0000-0000-000000000010",
                "ref_id": "ln-1",
                "name": "Linia GPZ-Zaklad",
                "tags": [],
                "meta": {},
                "from_bus_ref": "b1",
                "to_bus_ref": "b2",
                "status": "closed",
                "type": "line_overhead",
                "length_km": LINE_KM,
                "r_ohm_per_km": R_OHM_KM,
                "x_ohm_per_km": X_OHM_KM,
                "catalog_ref": "LINIA_SN:reczne",
                "catalog_namespace": "LINIA_SN",
            }
        ],
        "transformers": [],
        "sources": [
            {
                "id": "00000000-0000-0000-0000-000000000003",
                "tags": [],
                "meta": {},
                **gpz_source_record(
                    ref_id="s1",
                    name="S1",
                    bus_ref="b1",
                    voltage_kv=U_KV,
                    sk3_mva=500.0,
                    rx_ratio=0.10,
                ),
            }
        ],
        "loads": [load],
        "generators": [
            {
                "id": "00000000-0000-0000-0000-000000000040",
                "ref_id": "g1",
                "name": "Agregat kogeneracyjny",
                "tags": [],
                "meta": meta,
                "bus_ref": "b2",
                "gen_type": "synchronous",
                "p_mw": P_GEN_MW,
                "q_mvar": 0.0,
                "sn_mva": 5.0,
            }
        ],
        "shunt_capacitors": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
        "branch_points": [],
    }


@pytest.fixture(autouse=True)
def _reset_state():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _run(case_id: str, payload: dict):
    enm = EnergyNetworkModel.model_validate(payload)
    walidacja = ENMValidator().validate(enm)
    assert walidacja.status != "FAIL", [
        issue.message_pl for issue in walidacja.issues if issue.severity == "BLOCKER"
    ]
    set_enm(case_id, enm)
    run = execute_run(
        create_run(
            case_id=case_id, klucz_twin=case_id, analysis_type="PF", options={"base_mva": BASE_MVA}
        ).id
    )
    assert run.status == "FINISHED", run.error_message
    return run


def _bus(run, ref_id: str) -> dict:
    buses = {b["bus_id"]: b for b in run.raw_result["result_v1"]["bus_results"]}
    return buses[_graph_id_from_ref(ref_id)]


def _referencyjny_newton(
    *, zip_load: bool, q_zrodla_mvar_of_p: float
) -> tuple[float, float, float]:
    """NIEZALEZNY Newton (czysty numpy) — slack + szyna PQ prosumencka.

    Zwraca (|V| szyny b2 [pu], P wstrzykiwana w b2 [MW], Q wstrzykiwana w b2 [Mvar]).
    Zaden element badanego solvera nie jest tu uzyty."""
    z_base = U_KV * U_KV / BASE_MVA
    y = 1.0 / (complex(R_OHM_KM * LINE_KM, X_OHM_KM * LINE_KM) / z_base)
    ybus = np.array([[y, -y], [-y, y]], dtype=complex)

    def zadane(v_mag: float) -> tuple[float, float]:
        f_zip = v_mag * v_mag if zip_load else 1.0
        p = (-P_LOAD_MW * f_zip + P_GEN_MW) / BASE_MVA
        q = (-Q_LOAD_MVAR * f_zip + q_zrodla_mvar_of_p) / BASE_MVA
        return p, q

    theta, v_mag = 0.0, 1.0
    for _ in range(200):
        v = np.array([1.0 + 0j, v_mag * np.exp(1j * theta)], dtype=complex)
        s_calc = v * np.conj(ybus @ v)
        p_zad, q_zad = zadane(v_mag)
        f = np.array([s_calc[1].real - p_zad, s_calc[1].imag - q_zad])
        if float(np.max(np.abs(f))) < 1e-14:
            break
        eps = 1e-8
        jak = np.zeros((2, 2))
        for kol, (d_theta, d_v) in enumerate(((eps, 0.0), (0.0, eps))):
            th2, vm2 = theta + d_theta, v_mag + d_v
            v2 = np.array([1.0 + 0j, vm2 * np.exp(1j * th2)], dtype=complex)
            s2 = v2 * np.conj(ybus @ v2)
            p2, q2 = zadane(vm2)
            jak[:, kol] = (np.array([s2[1].real - p2, s2[1].imag - q2]) - f) / eps
        krok = np.linalg.solve(jak, -f)
        theta += krok[0]
        v_mag += krok[1]

    p_zad, q_zad = zadane(v_mag)
    return v_mag, p_zad * BASE_MVA, q_zad * BASE_MVA


# --------------------------------------------------------------------- sedzia


@pytest.mark.parametrize("zip_load", [True, False])
def test_referencyjny_newton_zgadza_sie_bez_regulacji(zip_load: bool) -> None:
    """Kontrola odniesienia: bez aktywnej regulacji lancuch i wlasny Newton sa zgodne.

    Bez tego kroku dowod nie mialby wartosci — najpierw potwierdzamy, ze sedzia
    opisuje TEN SAM uklad. Jednoczesnie to test determinizmu: zrodlo bez regulacji
    (brak `control_mode`) nie dostaje `inverter_control`, wiec sciezka jest ta
    sama, co przed naprawa.
    """
    run = _run(f"prosument-ref-{zip_load}", _payload("Bez regulacji", meta={}, zip_load=zip_load))
    v_odn, p_odn, q_odn = _referencyjny_newton(zip_load=zip_load, q_zrodla_mvar_of_p=0.0)
    assert _bus(run, "b2")["v_pu"] == pytest.approx(v_odn, abs=1e-9)
    assert _bus(run, "b2")["p_injected_mw"] == pytest.approx(p_odn, abs=1e-6)
    assert _bus(run, "b2")["q_injected_mvar"] == pytest.approx(q_odn, abs=1e-6)


# ------------------------------------------------- (d) dowod liczbowy defektu B


@pytest.mark.parametrize("zip_load", [True, False])
def test_cos_phi_liczony_z_mocy_wytworcy_a_nie_z_mocy_szyny(zip_load: bool) -> None:
    """DOWOD LICZBOWY (§3d): szyna prosumencka == fizyka, na sciezce produkcyjnej."""
    run = _run(
        f"prosument-cosphi-{zip_load}",
        _payload(
            "Regulacja cos fi",
            meta={"control_mode": "STALY_COS_PHI", "cos_phi": COS_PHI},
            zip_load=zip_load,
        ),
    )
    v_odn, p_odn, q_odn = _referencyjny_newton(
        zip_load=zip_load, q_zrodla_mvar_of_p=TAN_PHI * P_GEN_MW
    )
    b2 = _bus(run, "b2")
    assert b2["v_pu"] == pytest.approx(v_odn, abs=1e-6)
    assert b2["p_injected_mw"] == pytest.approx(p_odn, abs=1e-6)
    assert b2["q_injected_mvar"] == pytest.approx(q_odn, abs=1e-6)


@pytest.mark.parametrize("zip_load", [True, False])
def test_znak_mocy_biernej_szyny_nie_jest_odwrocony(zip_load: bool) -> None:
    """SEDNO defektu: szyna POBIERA moc bierna, a lancuch raportowal ODDAWANIE.

    Przed naprawa moc bierna wytworcy powstawala z mocy czynnej ODBIORU
    (tan(phi) * P_odb * f_ZIP), a skladnik -Q_odb * f_ZIP znikal calkowicie —
    obie te wartosci sa tu odrzucane asercyjnie, zeby regresja byla wykrywalna.
    """
    run = _run(
        f"prosument-znak-{zip_load}",
        _payload(
            "Regulacja cos fi",
            meta={"control_mode": "STALY_COS_PHI", "cos_phi": COS_PHI},
            zip_load=zip_load,
        ),
    )
    b2 = _bus(run, "b2")
    v = b2["v_pu"]
    f_zip = v * v if zip_load else 1.0
    _v_odn, _p_odn, q_odn = _referencyjny_newton(
        zip_load=zip_load, q_zrodla_mvar_of_p=TAN_PHI * P_GEN_MW
    )
    assert q_odn < 0.0, "odniesienie: szyna pobiera moc bierna"
    assert b2["q_injected_mvar"] < 0.0, f"lancuch nadal oddaje {b2['q_injected_mvar']} Mvar"
    # Formula defektu: Q zrodla z mocy czynnej ODBIORU, baza Q odbioru skasowana.
    q_defektu = TAN_PHI * P_LOAD_MW * f_zip
    assert b2["q_injected_mvar"] != pytest.approx(q_defektu, abs=1e-6)


def test_moc_bierna_zadana_wytworcy_dodaje_sie_do_odbioru() -> None:
    """{moc bierna zadana} x {odbior}: Q zrodla wchodzi jako SKLADNIK szyny.

    Tryb Q_CONST jest pasywny sam w sobie, wiec aktywuje go statyzm P(f) — co
    dodatkowo przypina, ze LFSM skaluje moc WYTWORCY, nie moc odbioru (przed
    naprawa `p_spec[idx] *= lfsm_factor` skalowal cala szyne, czyli odbior).
    """
    q_zrodla = 0.8
    payload = _payload(
        "Q zadane + statyzm P(f)",
        meta={"frequency_droop_percent": 5.0, "lfsm_deadband_hz": 0.2},
        zip_load=True,
    )
    payload["generators"][0]["q_mvar"] = q_zrodla
    run = _run("prosument-q-zadane", payload)
    b2 = _bus(run, "b2")
    # Studium przy 50 Hz => mnoznik LFSM dokladnie 1,0 => moc wytworcy bez zmian.
    v_odn, p_odn, q_odn = _referencyjny_newton(zip_load=True, q_zrodla_mvar_of_p=q_zrodla)
    assert b2["v_pu"] == pytest.approx(v_odn, abs=1e-6)
    assert b2["p_injected_mw"] == pytest.approx(p_odn, abs=1e-6)
    assert b2["q_injected_mvar"] == pytest.approx(q_odn, abs=1e-6)
    # Zapotrzebowanie bierne odbioru NIE zniknelo z modelu.
    assert b2["q_injected_mvar"] < q_zrodla


def test_dwa_regulowane_zrodla_na_jednej_szynie_sa_odrzucane() -> None:
    """Kontrakt rozplywu ma jedna charakterystyke na wezel — drugie zrodlo z
    aktywna regulacja bylo dotad po cichu nadpisywane (moc bierna pierwszego
    znikala). Teraz przypadek jest odrzucany jawnie."""
    payload = _payload(
        "Dwa regulowane zrodla",
        meta={"control_mode": "STALY_COS_PHI", "cos_phi": COS_PHI},
        zip_load=False,
    )
    drugi = dict(payload["generators"][0])
    drugi["id"] = "00000000-0000-0000-0000-000000000041"
    drugi["ref_id"] = "g2"
    drugi["name"] = "Drugi agregat"
    payload["generators"] = [payload["generators"][0], drugi]
    enm = EnergyNetworkModel.model_validate(payload)
    set_enm("prosument-dwa", enm)
    run = execute_run(
        create_run(
            case_id="prosument-dwa",
            klucz_twin="prosument-dwa",
            analysis_type="PF",
            options={"base_mva": BASE_MVA},
        ).id
    )
    assert run.status == "FAILED"
    assert "wiecej niz jedno zrodlo z aktywna regulacja" in (run.error_message or "")
