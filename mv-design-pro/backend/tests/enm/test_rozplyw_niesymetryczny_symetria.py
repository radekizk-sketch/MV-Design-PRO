"""Karta W5-D — klasa {sieć symetryczna, odbiór trójfazowy} × {U, I, straty}:
rozpływ niesymetryczny (BFS, baza jednej fazy) daje |U_A| = |U_B| = |U_C| równe
rozpływowi NR (FROZEN `power_flow_newton`) w tolerancji NAZWANEJ Z POMIARU.

Sieć: GPZ 15 kV → kabel 2 km → stacja → TR Dyn11 630 kVA → szyna nN z odbiorem
trójfazowym 400 kW + 130 kvar, kabel bez pojemności (solver BFS nie ma admitancji
poprzecznej — założenie nazwane `power_flow.unbalanced_shunt_admittance_omitted`;
przy B = 0 oba solvery rozwiązują TE SAME równania). Odbiór duży (obciążenie ~66 %
Sn TR), żeby spadek napięcia na nN był rzędu 3 % — różnica 3× (baza trójfazowa
starego dialektu) byłaby widoczna gołym okiem, a 1 pu ≈ 1 pu nie „przechodzi
przypadkiem".

Pomiar (2026-09-16, ten test): |ΔU| BFS vs NR ≤ 2·10⁻⁶ pu (tolerancje zbieżności:
BFS 1e-6 na |ΔV|, NR 1e-8 na niedopasowanie mocy), prąd gałęzi ≤ 0,05 %, straty
całkowite ≤ 0,1 % — tolerancje testu = 5× pomiar, nazwane w asercjach.

Niezależność od Z₀ przy obciążeniu symetrycznym (I_a+I_b+I_c ≡ 0 ⇒ spadek fazy =
(Z_s − Z_m)·I = Z₁·I): dwa RÓŻNE komplety R0/X0 dają napięcia BIT W BIT równe.
"""

from __future__ import annotations

import math
import uuid
from datetime import UTC, datetime
from typing import Any

from enm.canonical_analysis import (
    ANALYSIS_TYPE_ROZPLYW_NIESYMETRYCZNY,
    CanonicalRun,
    _wykonaj_analize_biegu,
)
from enm.models import Bus, Cable, EnergyNetworkModel, ENMHeader, Load, Source, Transformer


def siec_symetryczna(*, r0: float = 0.759, x0: float = 0.3) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="w5d-symetria"),
        buses=[
            Bus(ref_id="b_gpz", name="GPZ 15 kV", voltage_kv=15.0),
            Bus(ref_id="b_sn", name="Stacja SN", voltage_kv=15.0),
            Bus(ref_id="b_nn", name="Szyna nN", voltage_kv=0.4),
        ],
        sources=[
            Source(
                ref_id="src",
                name="System",
                bus_ref="b_gpz",
                model="short_circuit_power",
                sk3_mva=250.0,
                rx_ratio=0.1,
            )
        ],
        branches=[
            Cable(
                ref_id="cab1",
                name="Kabel 1",
                from_bus_ref="b_gpz",
                to_bus_ref="b_sn",
                length_km=2.0,
                r_ohm_per_km=0.253,
                x_ohm_per_km=0.1,
                r0_ohm_per_km=r0,
                x0_ohm_per_km=x0,
            )
        ],
        transformers=[
            Transformer(
                ref_id="tr1",
                name="TR 15/0,4",
                hv_bus_ref="b_sn",
                lv_bus_ref="b_nn",
                sn_mva=0.63,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.5,
                pk_kw=6.5,
                vector_group="Dyn11",
            )
        ],
        loads=[Load(ref_id="ld1", name="Odbior", bus_ref="b_nn", p_mw=0.4, q_mvar=0.13)],
    )


def _bieg(enm: EnergyNetworkModel, analysis_type: str) -> CanonicalRun:
    run = CanonicalRun(
        id=uuid.uuid4(),
        case_id="w5d-sym",
        project_id="w5d-sym",
        analysis_type=analysis_type,
        status="RUNNING",
        created_at=datetime(2026, 9, 16, tzinfo=UTC),
        snapshot_hash="snap",
        input_hash="in",
        snapshot=enm.model_dump(mode="json"),
        validation={},
        readiness={},
        options={"base_mva": 100.0, "tolerance": 1e-9},
    )
    _wykonaj_analize_biegu(run)
    return run


def _napiecia_nr(run: CanonicalRun) -> dict[str, float]:
    return {row["bus_id"]: row["v_pu"] for row in run.raw_result["result_v1"]["bus_results"]}


def _napiecia_bfs(run: CanonicalRun) -> dict[str, tuple[float, float, float]]:
    return {
        row["bus_id"]: (row["faza_a"]["u_pu"], row["faza_b"]["u_pu"], row["faza_c"]["u_pu"])
        for row in run.raw_result["result_v1"]["bus_results"]
    }


def test_siec_symetryczna_napiecia_faz_rowne_i_zgodne_z_nr() -> None:
    enm = siec_symetryczna()
    nr = _bieg(enm, "PF")
    bfs = _bieg(enm, ANALYSIS_TYPE_ROZPLYW_NIESYMETRYCZNY)
    u_nr = _napiecia_nr(nr)
    u_bfs = _napiecia_bfs(bfs)
    assert set(u_nr) == set(u_bfs) and len(u_nr) == 3
    spadek_nn = 1.0 - min(u_nr.values())
    # Pomiar NR na tej sieci: 0,0172 pu (kabel 2 km + TR 630 kVA przy 66 % Sn) —
    # próg 0,015 pu = spadek trzykrotnie większy niż błąd „bazy trójfazowej" (0,0057).
    assert spadek_nn > 0.015, f"odbiór ma dać widoczny spadek (pomiar: {spadek_nn:.4f} pu)"
    for bus_id, (ua, ub, uc) in u_bfs.items():
        # |U_A| = |U_B| = |U_C| (symetria) — bit w bit po zaokrągleniu kontraktu (6 miejsc).
        assert ua == ub == uc, (bus_id, ua, ub, uc)
        # Tolerancja z pomiaru: 2·10⁻⁶ pu (tolerancje zbieżności obu solverów) × 5.
        assert abs(ua - u_nr[bus_id]) <= 1e-5, (bus_id, ua, u_nr[bus_id])
    vuf = {
        row["bus_id"]: row["voltage_unbalance_factor_pct"]
        for row in bfs.raw_result["result_v1"]["bus_results"]
    }
    assert all(v == 0.0 for v in vuf.values())


def test_siec_symetryczna_prady_zgodne_z_nr() -> None:
    enm = siec_symetryczna()
    nr = _bieg(enm, "PF")
    bfs = _bieg(enm, ANALYSIS_TYPE_ROZPLYW_NIESYMETRYCZNY)
    prady_nr_a = {bid: ka * 1000.0 for bid, ka in nr.raw_result["branch_current_ka"].items()}
    for row in bfs.raw_result["result_v1"]["branch_results"]:
        i_a, i_b, i_c = row["faza_a"]["i_a"], row["faza_b"]["i_a"], row["faza_c"]["i_a"]
        assert i_a == i_b == i_c
        assert i_a > 0.0
        # Pomiar: BFS 16,473 A vs NR 16,4727 A (kabel i TR po stronie 15 kV) — 0,05 % × 5.
        assert math.isclose(i_a, prady_nr_a[row["branch_id"]], rel_tol=2.5e-3), (
            row["element_id"],
            i_a,
            prady_nr_a[row["branch_id"]],
        )


def test_siec_symetryczna_straty_zgodne_z_nr_gdy_z0_rowne_z1() -> None:
    """Straty: solver FROZEN liczy |I|²·Z_s (impedancja własna) — bez wyrazu wzajemnego.
    Przy Z0 = Z1 (Z_m = 0) Z_s = Z1 i straty są tożsame z NR (pomiar: 0,1 % × 5)."""
    enm = siec_symetryczna(r0=0.253, x0=0.1)
    nr = _bieg(enm, "PF")
    bfs = _bieg(enm, ANALYSIS_TYPE_ROZPLYW_NIESYMETRYCZNY)
    straty_nr = nr.raw_result["result_v1"]["summary"]["total_losses_p_mw"]
    straty_bfs = bfs.raw_result["result_v1"]["summary"]["total_losses_p_mw"]
    assert straty_bfs > 0.0
    assert math.isclose(straty_bfs, straty_nr, rel_tol=5e-3), (straty_bfs, straty_nr)
    # Z_m = 0 dla wszystkich gałęzi → założenie strat z impedancji własnej NIE jest emitowane.
    kody = [z["kod"] for z in bfs.raw_result["zalozenia"]]
    assert "power_flow.unbalanced_losses_self_impedance" not in kody


def test_siec_symetryczna_straty_zgodne_z_nr_takze_przy_z0_rozne_od_z1() -> None:
    """Odbiory symetryczne: żadną krawędzią nie płynie realny I0, więc Z0 kabla NIE
    wchodzi do równań (Z_m := 0 z topologii, tożsamość) — straty zgodne z NR także przy
    katalogowym R0 = 3·R1 (przed analizą drogi I0 solver liczył tu |I|²·R_s = 5/3 strat
    NR, pomiar 2026-09-16: 0,000687 vs 0,000412 MW)."""
    enm = siec_symetryczna(r0=0.759, x0=0.3)
    nr = _bieg(enm, "PF")
    bfs = _bieg(enm, ANALYSIS_TYPE_ROZPLYW_NIESYMETRYCZNY)
    straty_nr = nr.raw_result["result_v1"]["summary"]["total_losses_p_mw"]
    straty_bfs = bfs.raw_result["result_v1"]["summary"]["total_losses_p_mw"]
    assert math.isclose(straty_bfs, straty_nr, rel_tol=5e-3), (straty_bfs, straty_nr)
    kody = [z["kod"] for z in bfs.raw_result["zalozenia"]]
    assert "power_flow.unbalanced_losses_self_impedance" not in kody


def test_straty_galezi_z_realnym_i0_licza_sie_z_impedancji_wlasnej_i_sa_nazwane() -> None:
    """Ograniczenie solvera FROZEN (B-01, znalezisko W5-D): straty gałęzi z realnym I0
    = Σ|I_φ|²·R_s (impedancja własna, bez wyrazu wzajemnego), R_s = (R0 + 2·R1)/3.
    Odbiór faza–N wprost na SN: kabel niesie realny I0 → Z_s ze składowych; pin
    formuły z prądów i R_s ze śladu + założenie `losses_self_impedance` z listą gałęzi."""
    enm = siec_symetryczna(r0=0.759, x0=0.3)
    dane = enm.model_dump(mode="json")
    dane["loads"] = [
        {
            "ref_id": "ld_sn",
            "name": "Odbior SN 1-f",
            "bus_ref": "b_sn",
            "p_mw": 0.3,
            "q_mvar": 0.1,
            "phases": "A",
        }
    ]
    bfs = _bieg(EnergyNetworkModel.model_validate(dane), ANALYSIS_TYPE_ROZPLYW_NIESYMETRYCZNY)
    kabel = next(
        r for r in bfs.raw_result["result_v1"]["branch_results"] if r["element_id"] == "cab1"
    )
    krok = next(k for k in bfs.white_box_trace if k["key"] == "pf_unbalanced_branch[cab1]")
    r_s = krok["result"]["z_self_ohm"]["re"]
    assert math.isclose(r_s, (0.759 + 2.0 * 0.253) * 2.0 / 3.0, rel_tol=1e-12)
    suma_i2 = sum(kabel[f]["i_a"] ** 2 for f in ("faza_a", "faza_b", "faza_c"))
    # Straty [MW] = Σ|I|²·R_s [W] / 1e6; prądy w kontrakcie zaokrąglone do 3 miejsc.
    assert math.isclose(kabel["losses_p_mw"], suma_i2 * r_s / 1e6, rel_tol=2e-3)
    zalozenie = next(
        z
        for z in bfs.raw_result["zalozenia"]
        if z["kod"] == "power_flow.unbalanced_losses_self_impedance"
    )
    assert zalozenie["elementy"] == ["cab1"]


def test_obciazenie_symetryczne_napiecia_nie_zaleza_od_z0() -> None:
    """Dwa różne komplety Z0 (kabel: 3·Z1 z katalogu; Kersting cfg 300 w Ω/km) —
    napięcia, prądy i straty bit w bit: dla I_a+I_b+I_c ≡ 0 Z0 nie wchodzi do równań
    (analiza drogi I0: kabel bez realnego I0 → Z_m := 0 z topologii, ślad nazywa powód)."""
    pierwszy = _bieg(siec_symetryczna(r0=0.759, x0=0.3), ANALYSIS_TYPE_ROZPLYW_NIESYMETRYCZNY)
    drugi = _bieg(siec_symetryczna(r0=1.0873, x0=1.4737), ANALYSIS_TYPE_ROZPLYW_NIESYMETRYCZNY)
    assert _napiecia_bfs(pierwszy) == _napiecia_bfs(drugi)
    prady = lambda run: [  # noqa: E731
        (r["element_id"], r["faza_a"]["i_a"]) for r in run.raw_result["result_v1"]["branch_results"]
    ]
    assert prady(pierwszy) == prady(drugi)
    assert (
        pierwszy.raw_result["result_v1"]["summary"]["total_losses_p_mw"]
        == drugi.raw_result["result_v1"]["summary"]["total_losses_p_mw"]
    )

    def _krok(run: CanonicalRun) -> Any:
        return next(k for k in run.white_box_trace if k["key"] == "pf_unbalanced_branch[cab1]")

    for run in (pierwszy, drugi):
        assert _krok(run)["inputs"]["z0_ohm"] is None
        assert "z topologii" in _krok(run)["substitution"]
        assert _krok(run)["result"]["z_mutual_ohm"] == {"re": 0.0, "im": 0.0}
