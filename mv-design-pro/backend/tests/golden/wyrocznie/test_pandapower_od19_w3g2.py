"""Wyrocznia pandapower dla topologii W3-G2 (karta PF-OD19, 2026-09-30).

Trzy pomiary, każdy przypięty liczbą Z POMIARU (pandapower 3.5.4, most ``pandapower.py``):

1. Receptura speca e2e (TR1 110/15 kV nadpisany tabliczką 630 kVA 15/0,4 kV): pandapower
   ze startu płaskiego ląduje na TYM SAMYM rozwiązaniu zerowym co rdzeń NR — U_110 = 0,
   moc źródła 5713,39 MW / 21 399 Mvar, |ΔP| = 2,5·10⁻⁷ MW. Rozwiązanie zerowe szyny PQ
   o zerowej mocy nie jest defektem naszego rdzenia, lecz własnością równań rozpływu.
2. TR1 nietknięty (25 MVA) i i0 = P0 = 0 na obu transformatorach: gałąź robocza zgodna
   z pandapower do |ΔU| ≤ 1·10⁻⁶ p.u. (pomiar 5,9·10⁻⁷; reszta to model łącznika
   zamkniętego 0,1 mΩ, jak w ``test_pandapower_wyspy.py``) i |ΔP| ≤ 1·10⁻⁵ MW.
3. TR1 nietknięty z i0/P0 Z KATALOGU (0,35 % / 25 kW; stacja 1,5 % / 1,3 kW): rozjazd
   |ΔU_110| = 1,87·10⁻⁴ p.u., |ΔU_nN| = 3,0·10⁻⁴ p.u., ΔQ = 93 kvar, ΔP = 26 kW — bo
   rdzeń rozpływu NR pomija gałąź magnesującą transformatora
   (``power_flow_newton_internal._get_branch_admittances_ohm`` oddaje bocznik 0 dla
   ``TransformerBranch``), a most pandapower ją odwzorowuje (``pfe_kw``/``i0_percent``).
   To przypięcie luki rdzenia FROZEN (B-01) zgłoszonej w ``MELDUNEK_PF_OD19.md`` — nie
   tolerancja „na wszelki wypadek"; zniknięcie albo wzrost luki ma zaświecić.

Marker ``pandapower``: biegnie wyłącznie w izolowanym jobie CI (scipy<1.17).
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from enm.assembler import zloz_wejscie_rozplywu
from enm.models import EnergyNetworkModel
from fastapi.testclient import TestClient
from network_model.solvers.power_flow_newton import solve_power_flow_physics

from tests.golden.wyrocznie import pandapower as most
from tests.reference_networks.w3g2_pasma_rozplywu import NAZWA_SZYNY_110, zbuduj_siec_w3g2

pytestmark = pytest.mark.pandapower

#: Kryterium karty PF-OD19 dla gałęzi roboczej (pomiar 5,855·10⁻⁷ p.u.).
TOLERANCJA_U_PU = 1e-6
#: Moc źródła [MW/Mvar] — jak ``test_pandapower_wyspy.TOLERANCJA_MOC_MW`` (pomiar 2,5·10⁻⁷).
TOLERANCJA_MOC_MW = 1e-5
#: Rozwiązanie zerowe: |U| poniżej tej wartości to numeryczne zero.
U_ZERO_PU = 1e-9
#: Luka gałęzi magnesującej na szynie 110 kV (pomiar 1,87·10⁻⁴ p.u.) — pas przypięcia.
LUKA_MAGNESUJACA_U110_PU = (1.5e-4, 2.5e-4)
#: Ta sama luka w mocy biernej źródła (pomiar 0,0932 Mvar) i czynnej (0,0263 MW).
LUKA_MAGNESUJACA_Q_MVAR = (0.08, 0.11)
LUKA_MAGNESUJACA_P_MW = (0.02, 0.03)


@pytest.fixture(scope="module")
def migawki() -> dict[str, dict[str, Any]]:
    from api.main import app

    with TestClient(app) as klient:
        return {
            "spec": zbuduj_siec_w3g2(klient, tr1_nadpisany=True),
            "czysty": zbuduj_siec_w3g2(klient, tr1_nadpisany=False),
        }


def _bez_galezi_magnesujacej(snapshot: dict[str, Any]) -> dict[str, Any]:
    kopia = copy.deepcopy(snapshot)
    for transformator in kopia["transformers"]:
        transformator["i0_percent"] = 0.0
        transformator["p0_kw"] = 0.0
        if transformator.get("materialized_params"):
            transformator["materialized_params"]["i0_percent"] = 0.0
            transformator["materialized_params"]["p0_kw"] = 0.0
    return kopia


def _nr(snapshot: dict[str, Any]) -> tuple[dict[str, float], float, float]:
    """(|U| per nazwa szyny, P_slack MW, Q_slack Mvar) z rdzenia NR (start płaski)."""
    wejscie = zloz_wejscie_rozplywu(snapshot, {"solver_method": "newton-raphson"})
    pfi = wejscie.wyspy[0].pf_input
    sol = solve_power_flow_physics(pfi)
    assert sol.converged
    nazwy = {nid: n.name for nid, n in pfi.typed_graph().nodes.items()}
    return (
        {nazwy[nid]: u for nid, u in sol.node_u_mag.items()},
        sol.slack_power.real * pfi.base_mva,
        sol.slack_power.imag * pfi.base_mva,
    )


def _pp(snapshot: dict[str, Any]) -> tuple[dict[str, float], float, float]:
    enm = EnergyNetworkModel.model_validate(snapshot)
    nazwy = {b.ref_id: b.name for b in enm.buses}
    wynik = most.rozplyw(enm)
    (p_mw, q_mvar) = next(iter(wynik["zrodla"].values()))
    return {nazwy[ref]: vm for ref, (vm, _) in wynik["szyny"].items()}, p_mw, q_mvar


def _max_du(u_nr: dict[str, float], u_pp: dict[str, float]) -> float:
    assert set(u_nr) == set(u_pp)
    return max(abs(u_nr[n] - u_pp[n]) for n in u_nr)


def test_receptura_speca_pandapower_laduje_na_tym_samym_rozwiazaniu_zerowym(migawki) -> None:
    # Z parametrami katalogowymi (i0/P0 obu transformatorów) oba solvery lądują na zerze;
    # moc źródła różni się o gałąź magnesującą (pomiar: 5714,31 vs 5713,39 MW), więc
    # parytet liczb dowodzi się na wariancie bez tej gałęzi (jak w teście gałęzi roboczej).
    u_nr, p_nr, _ = _nr(migawki["spec"])
    u_pp, p_pp, _ = _pp(migawki["spec"])
    assert u_nr[NAZWA_SZYNY_110] < U_ZERO_PU
    assert u_pp[NAZWA_SZYNY_110] < U_ZERO_PU
    assert p_nr == pytest.approx(5713.390880, abs=1e-3)
    assert p_pp == pytest.approx(5714.306, abs=1e-2)

    spec0 = _bez_galezi_magnesujacej(migawki["spec"])
    u_nr0, p_nr0, q_nr0 = _nr(spec0)
    u_pp0, p_pp0, q_pp0 = _pp(spec0)
    assert u_nr0[NAZWA_SZYNY_110] < U_ZERO_PU and u_pp0[NAZWA_SZYNY_110] < U_ZERO_PU
    assert p_nr0 == pytest.approx(5713.390880, abs=1e-3)
    assert p_pp0 == pytest.approx(p_nr0, abs=TOLERANCJA_MOC_MW)
    assert q_pp0 == pytest.approx(q_nr0, abs=TOLERANCJA_MOC_MW)
    assert _max_du(u_nr0, u_pp0) <= TOLERANCJA_U_PU


def test_tr1_nietkniety_bez_galezi_magnesujacej_parytet_galezi_roboczej(migawki) -> None:
    czysty = _bez_galezi_magnesujacej(migawki["czysty"])
    u_nr, p_nr, q_nr = _nr(czysty)
    u_pp, p_pp, q_pp = _pp(czysty)
    assert u_nr[NAZWA_SZYNY_110] == pytest.approx(1.0, abs=1e-9)
    assert u_pp[NAZWA_SZYNY_110] == pytest.approx(1.0, abs=1e-9)
    assert _max_du(u_nr, u_pp) <= TOLERANCJA_U_PU
    assert p_pp == pytest.approx(p_nr, abs=TOLERANCJA_MOC_MW)
    assert q_pp == pytest.approx(q_nr, abs=TOLERANCJA_MOC_MW)
    assert p_nr == pytest.approx(0.500255, abs=1e-5)


def test_tr1_nietkniety_z_katalogu_luka_galezi_magnesujacej_rdzenia(migawki) -> None:
    """Rdzeń NR pomija i0/P0 transformatora (bocznik 0), pandapower je liczy — luka
    przypięta pasem z pomiaru; zmiana rdzenia (B-01) albo mostu musi ją przesunąć."""
    u_nr, p_nr, q_nr = _nr(migawki["czysty"])
    u_pp, p_pp, q_pp = _pp(migawki["czysty"])
    # Szyna 110 kV: w rdzeniu ślepy koniec bez bocznika → dokładnie U slacka (1,0);
    # w pandapower prąd magnesujący TR1 płynie przez Z_T → spadek ~1,9·10⁻⁴ p.u.
    assert u_nr[NAZWA_SZYNY_110] == pytest.approx(1.0, abs=1e-9)
    luka_110 = abs(u_nr[NAZWA_SZYNY_110] - u_pp[NAZWA_SZYNY_110])
    assert LUKA_MAGNESUJACA_U110_PU[0] <= luka_110 <= LUKA_MAGNESUJACA_U110_PU[1], luka_110
    assert LUKA_MAGNESUJACA_P_MW[0] <= p_pp - p_nr <= LUKA_MAGNESUJACA_P_MW[1], p_pp - p_nr
    assert LUKA_MAGNESUJACA_Q_MVAR[0] <= q_pp - q_nr <= LUKA_MAGNESUJACA_Q_MVAR[1], q_pp - q_nr
