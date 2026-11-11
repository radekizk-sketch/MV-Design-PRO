"""Impedancja zastępcza sieci w szynie (Z_th) w moście ENM → V12.6 — wyrocznia ręczna IEC 60909
(karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, commit 5, decyzja architekta wariant (a)).

Klasa defektu: przepustowość i rozruch silnika liczyły Z_th własną macierzą omową V12.6 bez
przekładni transformatorów — szyna SN za transformatorem WN/SN i każda szyna nN dostawały brak
(albo impedancję po złej stronie przekładni), a rozruch miał drugą drogę „podziału mocy
zwarciowej”. Teraz Z_th = Z_bus[k,k]·Z_b,k z KANONICZNEGO budowniczego sieci zwarciowej
(`short_circuit_core.build_zbus`): przekładnia, K_T (IEC 60909-0:2016 §6.3.3 eq. 12a), Z_Q
(§6.2.1 eq. 6) — liczone w moście (`impedancje_zastepcze_szyn`) tylko dla analiz, które ją
czytają.

Sieć wyroczni: zasilanie 110 kV (S″_kQ = 3000 MVA, R/X = 0,1, c_max = 1,1) — T1 110/15 kV
25 MVA u_k = 11 %, P_k = 120 kW — szyna SN — kabel 3 km (0,206 + j0,118 Ω/km) — szyna SN2 —
T2 15/0,4 kV 0,63 MVA u_k = 6 %, P_k = 6,5 kW, tolerancja nN +6 % (c_max = 1,05) — szyna nN.

ILOCZYN CECH: szyna {źródłowa WN, SN za transformatorem, SN za transformatorem i kablem, nN}
× analiza {przepustowość, rozruch silnika} (+ analiza, która Z_th nie czyta — wejście bez pól)
× wyspa {szyna zasilana, wyspa bez źródła — brak nazwany}; sieci wzorcowe gn01–gn06 (każda szyna
zasilana ma Z_th); determinizm wejścia.
"""

from __future__ import annotations

import math
from typing import Any

import pytest
from enm.models import EnergyNetworkModel, ENMHeader
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import (
    ANALIZY_IMPEDANCJI_ZASTEPCZEJ,
    V126AnalysisType,
    V126MotorInput,
    build_v126_input_from_enm,
    impedancje_zastepcze_szyn,
)

from tests.reference_networks import builders as wzorcowe

# ---------------------------------------------------------------------------
# Wyrocznia ręczna (IEC 60909-0:2016) — każda liczba z jawnego wzoru.
# ---------------------------------------------------------------------------

C_MAX_SN_WN = 1.1  # tabela 1, sieci powyżej 1 kV
C_MAX_NN_PLUS_6 = 1.05  # tabela 1, sieci nN z tolerancją +6 %


def _z_q(un_kv: float, sk_mva: float, rx: float) -> complex:
    """Z_Q = c·U_n²/S″_kQ, X_Q = Z_Q/√(1 + (R/X)²), R_Q = (R/X)·X_Q (§6.2.1 eq. 6)."""
    z = C_MAX_SN_WN * un_kv**2 / sk_mva
    x = z / math.sqrt(1.0 + rx**2)
    return complex(rx * x, x)


def _k_t_z_t(u_kv: float, s_mva: float, uk_pct: float, pk_kw: float, c_max: float) -> complex:
    """Z_T po stronie u_kv: R_T = P_k·U²/S², |Z_T| = u_k·U²/S, X_T = √(Z_T² − R_T²);
    K_T = 0,95·c_max/(1 + 0,6·x_T), x_T = X_T/(U²/S) (§6.3.3 eq. 12a)."""
    z_b = u_kv**2 / s_mva
    z = uk_pct / 100.0 * z_b
    r = pk_kw / 1000.0 * u_kv**2 / s_mva**2
    x = math.sqrt(z**2 - r**2)
    k_t = 0.95 * c_max / (1.0 + 0.6 * x / z_b)
    return k_t * complex(r, x)


Z_WN = _z_q(110.0, 3000.0, 0.1)
Z_SN = Z_WN * (15.0 / 110.0) ** 2 + _k_t_z_t(15.0, 25.0, 11.0, 120.0, C_MAX_SN_WN)
Z_SN2 = Z_SN + 3.0 * complex(0.206, 0.118)
Z_NN = Z_SN2 * (0.4 / 15.0) ** 2 + _k_t_z_t(0.4, 0.63, 6.0, 6.5, C_MAX_NN_PLUS_6)

WYROCZNIA: dict[str, complex] = {"WN": Z_WN, "SN": Z_SN, "SN2": Z_SN2, "NN": Z_NN}


def test_wyrocznia_reczna_liczby_kontrolne() -> None:
    """Liczby kontrolne wyroczni (rachunek ręczny 2026-10-30): Z_SN = 0,050561 + j1,051721 Ω,
    K_T transformatora nN = 0,963336 — pin wzorów wyroczni, nie wyniku mostu."""
    assert Z_SN.real == pytest.approx(0.050561, abs=1e-6)
    assert Z_SN.imag == pytest.approx(1.051721, abs=1e-6)
    x_t = math.sqrt((0.06 * 0.16 / 0.63) ** 2 - (0.0065 * 0.16 / 0.63**2) ** 2) / (0.16 / 0.63)
    assert 0.95 * 1.05 / (1.0 + 0.6 * x_t) == pytest.approx(0.963336, abs=1e-6)


# ---------------------------------------------------------------------------
# Sieć wyroczni (ENM)
# ---------------------------------------------------------------------------


def _enm(*, wyspa: bool = False) -> EnergyNetworkModel:
    dane: dict[str, Any] = {
        "header": ENMHeader(name="impedancja-zastepcza-v126").model_dump(),
        "buses": [
            {"ref_id": "WN", "name": "Szyna 110 kV", "voltage_kv": 110.0},
            {"ref_id": "SN", "name": "Szyna SN", "voltage_kv": 15.0},
            {"ref_id": "SN2", "name": "Szyna SN za kablem", "voltage_kv": 15.0},
            {"ref_id": "NN", "name": "Szyna nN", "voltage_kv": 0.4},
        ],
        "sources": [
            {
                "ref_id": "Q",
                "name": "Sieć 110 kV",
                "bus_ref": "WN",
                "model": "short_circuit_power",
                "sk3_mva": 3000.0,
                "rx_ratio": 0.1,
            }
        ],
        "transformers": [
            {
                "ref_id": "T1",
                "name": "T1 110/15 kV",
                "hv_bus_ref": "WN",
                "lv_bus_ref": "SN",
                "sn_mva": 25.0,
                "uhv_kv": 110.0,
                "ulv_kv": 15.0,
                "uk_percent": 11.0,
                "pk_kw": 120.0,
            },
            {
                "ref_id": "T2",
                "name": "T2 15/0,4 kV",
                "hv_bus_ref": "SN2",
                "lv_bus_ref": "NN",
                "sn_mva": 0.63,
                "uhv_kv": 15.0,
                "ulv_kv": 0.4,
                "uk_percent": 6.0,
                "pk_kw": 6.5,
                "lv_voltage_tolerance": "PLUS_6",
            },
        ],
        "branches": [
            {
                "ref_id": "K1",
                "name": "Kabel SN",
                "type": "cable",
                "from_bus_ref": "SN",
                "to_bus_ref": "SN2",
                "length_km": 3.0,
                "r_ohm_per_km": 0.206,
                "x_ohm_per_km": 0.118,
            }
        ],
    }
    if wyspa:
        # Wyspa SN bez źródła sieciowego i maszyny — bez impedancji do odniesienia.
        dane["buses"] += [
            {"ref_id": "W1", "name": "Wyspa 1", "voltage_kv": 15.0},
            {"ref_id": "W2", "name": "Wyspa 2", "voltage_kv": 15.0},
        ]
        dane["branches"].append(
            {
                "ref_id": "KW",
                "name": "Kabel wyspy",
                "type": "cable",
                "from_bus_ref": "W1",
                "to_bus_ref": "W2",
                "length_km": 1.0,
                "r_ohm_per_km": 0.206,
                "x_ohm_per_km": 0.118,
            }
        )
    return EnergyNetworkModel.model_validate(dane)


def _z_wejscia(enm: EnergyNetworkModel, rodzaj: V126AnalysisType) -> dict[str, complex | None]:
    wejscie = build_v126_input_from_enm(enm, analysis_type=rodzaj)
    return {
        szyna.ref: (
            None
            if szyna.thevenin_r_ohm is None or szyna.thevenin_x_ohm is None
            else complex(szyna.thevenin_r_ohm, szyna.thevenin_x_ohm)
        )
        for szyna in wejscie.buses
    }


# ---------------------------------------------------------------------------
# Iloczyn: szyna × analiza × wyspa
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("rodzaj", sorted(ANALIZY_IMPEDANCJI_ZASTEPCZEJ), ids=str)
@pytest.mark.parametrize("szyna", list(WYROCZNIA))
@pytest.mark.parametrize("wyspa", [False, True], ids=["bez_wyspy", "z_wyspa"])
def test_z_th_szyny_z_mostu_rowna_wyroczni(
    rodzaj: V126AnalysisType, szyna: str, wyspa: bool
) -> None:
    z = _z_wejscia(_enm(wyspa=wyspa), rodzaj)[szyna]
    assert z is not None
    assert z.real == pytest.approx(WYROCZNIA[szyna].real, rel=1e-9, abs=1e-12)
    assert z.imag == pytest.approx(WYROCZNIA[szyna].imag, rel=1e-9, abs=1e-12)


@pytest.mark.parametrize("rodzaj", sorted(ANALIZY_IMPEDANCJI_ZASTEPCZEJ), ids=str)
def test_wyspa_bez_zrodla_nie_ma_z_th(rodzaj: V126AnalysisType) -> None:
    z = _z_wejscia(_enm(wyspa=True), rodzaj)
    assert z["W1"] is None and z["W2"] is None


@pytest.mark.parametrize(
    "rodzaj", sorted(set(V126AnalysisType) - ANALIZY_IMPEDANCJI_ZASTEPCZEJ), ids=str
)
def test_analiza_bez_z_th_nie_niesie_pol_impedancji(rodzaj: V126AnalysisType) -> None:
    """Predykat parami: most liczy Z_th wtedy i tylko wtedy, gdy analiza ją czyta — wejście
    i odcisk pozostałych analiz bez pól `thevenin_*`."""
    wejscie = build_v126_input_from_enm(_enm(), analysis_type=rodzaj)
    assert all(s.thevenin_r_ohm is None and s.thevenin_x_ohm is None for s in wejscie.buses)
    zapis = wejscie.model_dump(mode="json")
    assert all("thevenin_r_ohm" not in s for s in zapis["buses"])


def _ze_sladu_hostingu(wynik: dict[str, Any]) -> dict[str, Any]:
    (krok,) = (k for k in wynik["white_box_trace"] if k["key"] == "stochastic_hosting_capacity")
    return dict(krok["data"]["impedancje_zastepcze_ohm"])


def test_przepustowosc_czyta_z_th_mostu_w_kazdej_szynie() -> None:
    """Analiza przepustowości × każda szyna: ślad niesie Z_th wyroczni (zaokr. 6 miejsc),
    szyny SN za transformatorem i nN mają wynik liczbowy, wyspa — brak nazwany."""
    rodzaj = V126AnalysisType.HOSTING_CAPACITY
    wejscie = build_v126_input_from_enm(_enm(wyspa=True), analysis_type=rodzaj)
    wejscie = wejscie.model_copy(update={"parameters": {"hosting_monte_carlo_n": 16}})
    wynik = V126AcademicSolver().run(rodzaj, wejscie)
    slad = _ze_sladu_hostingu(wynik)
    for szyna, z in WYROCZNIA.items():
        assert slad[szyna] == {"r_ohm": round(z.real, 6), "x_ohm": round(z.imag, 6)}
    wiersze = {w["bus_ref"]: w for w in wynik["result"]["hosting_capacity"]}
    for szyna in WYROCZNIA:
        assert wiersze[szyna]["hosting_capacity_mw"] is not None, szyna
    for szyna in ("W1", "W2"):
        assert slad[szyna] is None
        assert wiersze[szyna]["hosting_capacity_mw"] is None
        assert "nie ma impedancji zastępczej sieci" in wiersze[szyna]["brak_danych"]


@pytest.mark.parametrize("szyna", [*WYROCZNIA, "W1"])
def test_rozruch_silnika_czyta_z_th_mostu(szyna: str) -> None:
    """Rozruch silnika × każda szyna: Z_th wiersza = wyrocznia, zapad ΔU = |Z_th|·I_r/U_f;
    silnik w wyspie — brak nazwany bez liczby."""
    rodzaj = V126AnalysisType.MOTOR_STARTING
    u_kv = 0.4 if szyna == "NN" else (110.0 if szyna == "WN" else 15.0)
    silnik = V126MotorInput(
        ref="M1",
        bus_ref=szyna,
        rated_kw=200.0 if szyna == "NN" else 800.0,
        rated_voltage_kv=u_kv,
        rated_power_factor=0.88,
        rated_efficiency=0.95,
        locked_rotor_multiplier=6.0,
        start_power_factor=0.2,
        start_time_s=8.0,
        allowable_locked_rotor_time_s=20.0,
        max_torque_pu=2.2,
        critical_slip=0.15,
        load_start_torque_pu=0.5,
    )
    wejscie = build_v126_input_from_enm(_enm(wyspa=True), analysis_type=rodzaj)
    wejscie = wejscie.model_copy(update={"motors": [silnik]})
    (wiersz,) = V126AcademicSolver().run(rodzaj, wejscie)["result"]["motors"]
    if szyna == "W1":
        assert wiersz["thevenin_impedance_ohm"] is None
        assert wiersz["voltage_dip_percent"] is None
        assert "nie ma impedancji zastępczej sieci" in wiersz["message_pl"]
        return
    z = WYROCZNIA[szyna]
    assert wiersz["thevenin_impedance_ohm"] == {
        "r_ohm": round(z.real, 6),
        "x_ohm": round(z.imag, 6),
    }
    i_r = 6.0 * silnik.rated_kw / (math.sqrt(3.0) * u_kv * 0.88 * 0.95)
    du = abs(z) * i_r / (u_kv * 1000.0 / math.sqrt(3.0)) * 100.0
    assert wiersz["voltage_dip_percent"] == pytest.approx(du, abs=5e-5)


# ---------------------------------------------------------------------------
# Sieci wzorcowe gn01–gn06 i determinizm
# ---------------------------------------------------------------------------

_WZORCOWE = (
    "build_gn01_sn_promieniowa",
    "build_gn02_sn_odgalezienie",
    "build_gn03_sn_pierscien",
    "build_gn04_sn_nn_oze",
    "build_gn05_sn_nn_oze_ochrona",
    "build_gn06_pv_regulacja_napiecia",
)


@pytest.mark.parametrize("budowniczy", _WZORCOWE)
def test_sieci_wzorcowe_kazda_szyna_zasilana_ma_z_th(budowniczy: str) -> None:
    """gn01–gn06 (SN promieniowa, odgałęzienie, pierścień, SN+nN z OZE): każda szyna ma Z_th
    o dodatniej reaktancji i nieujemnej rezystancji (sieci wzorcowe nie mają wysp); szyny nN
    mają Z_th mniejszą niż szyna SN ich transformatora (przekładnia (U_nN/U_SN)²)."""
    enm = EnergyNetworkModel.model_validate(getattr(wzorcowe, budowniczy)()["enm"])
    z = impedancje_zastepcze_szyn(enm)
    assert set(z) == {b.ref_id for b in enm.buses}
    for ref, wartosc in z.items():
        assert wartosc["thevenin_r_ohm"] >= 0.0, ref
        assert wartosc["thevenin_x_ohm"] > 0.0, ref
    for trafo in enm.transformers:
        z_gn = z[trafo.hv_bus_ref]
        z_dn = z[trafo.lv_bus_ref]
        assert abs(complex(z_dn["thevenin_r_ohm"], z_dn["thevenin_x_ohm"])) < abs(
            complex(z_gn["thevenin_r_ohm"], z_gn["thevenin_x_ohm"])
        ), trafo.ref_id
    # Determinizm: to samo wejście → identyczny zapis (co do bitu).
    assert impedancje_zastepcze_szyn(enm) == z


def test_determinizm_wejscia_mostu() -> None:
    rodzaj = V126AnalysisType.HOSTING_CAPACITY
    zapisy = {
        build_v126_input_from_enm(_enm(wyspa=True), analysis_type=rodzaj).model_dump_json()
        for _ in range(3)
    }
    assert len(zapisy) == 1
