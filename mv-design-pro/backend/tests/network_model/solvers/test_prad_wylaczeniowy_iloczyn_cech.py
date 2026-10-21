"""Prąd wyłączeniowy I_b i składowa nieokresowa i_DC(t_b) — iloczyn cech (karta SC-IB-ITH-ZRODLA).

Iloczyn: {sieć odległa od generatora · maszyna synchroniczna · maszyna asynchroniczna · turbina
DFIG · źródło przekształtnikowe} × {t_b = 0,02 s · 0,1 s · 0,25 s · brak t_b} × {ślad White Box · dowód SC3F ·
eksport raportowy · ResultSet}. Każda komórka idzie REALNĄ ścieżką użytkownika: migawka ENM →
bieg kanoniczny (`wykonaj_bieg_w_pamieci`, opcja biegu `breaking_time_seconds` — projekcja
scenariusza zwarciowego) → wiersz wyniku → kanały prezentacji.

Wyrocznia RĘCZNA (sieć IEC 60909-4, szyna 33 kV, rachunek w komentarzu niżej) przypina liczby
do 6 cyfr; komórki z maszynami sprawdzają I_b wzorem rozdz. 9 z niezależną tablicą krzywych μ/q
tego testu (nie z tablicy solvera), więc zamiana krzywej albo wzoru w rdzeniu zmienia wynik
tego testu. Wstrzyknięcie dawnej formuły „I_b = I''k·sqrt(1 + ((κ−1)·e^{−t_b/t_a})²)"
(asymetryczny prąd wyłączeniowy z zaniku składowej DC — inna wielkość niż I_b normy) daje
5 844,684014 A zamiast 4 563,542872 A i czerwieni `test_wyrocznia_sieci_odleglej`.
"""

from __future__ import annotations

import math
import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from api.analysis_run_exports import _sc_row_glowne_linia
from application.proof_engine.packs.sc_symmetrical import SC3FPackInput, SC3FProofPack
from enm.canonical_analysis import (
    CanonicalRun,
    build_execution_result_set,
    build_short_circuit_results,
    wykonaj_bieg_w_pamieci,
)
from enm.mapping import _ref_to_uuid
from enm.models import EnergyNetworkModel
from network_model.core.czas_wylaczenia import KOD_CZAS_TB_BRAK
from network_model.solvers.short_circuit_iec60909 import (
    PRZYPADEK_IB_BEZ_MASZYN,
    PRZYPADEK_IB_MASZYNY,
)

from tests.golden.enm_builders.iec60909_example import build_iec60909_example_enm

# ---------------------------------------------------------------------------
# Rachunek ręczny — sieć IEC 60909-4 (BUS-HV 110 kV, S''k = 4000 MVA, R/X = 0,1;
# TR 110/33 kV 25 MVA, u_k = 10 %, u_R = 0,6 %; zwarcie 3F na szynie 33 kV, c = 1,1):
#   Z_Q = c·U²/S''k = 1,1·110²/4000 = 3,3275 Ω;  X_Q = Z_Q/sqrt(1 + 0,1²);  R_Q = 0,1·X_Q
#   przeniesione na 33 kV przez (33/110)²;  K_T = 0,95·c_max/(1 + 0,6·x_T) = 0,95·1,1/1,06
#   Z_T = u_k·U²/S = 0,10·33²/25 = 4,356 Ω (X_T ≈ Z_T, R_T z u_R) — K_T·Z_T dodane do pętli
#   |Z_k| → I''k = c·U_n/(sqrt(3)·|Z_k|) = 4 563,542872 A;  R/X = 0,006488811627577
#   I_b = I''k (zwarcie odległe od generatora, IEC 60909-0:2016 rozdz. 9) = 4 563,542872 A
#   i_DC(t_b) = sqrt(2)·I''k·e^{−2π·50·t_b·R/X}, sqrt(2)·I''k = 6 453,824222 A:
#     t_b = 0,02 s: e^{−0,040770} = 0,960064 → 6 195,990888 A
#     t_b = 0,10 s: e^{−0,203852} = 0,815587 → 5 263,629609 A
#     t_b = 0,25 s: e^{−0,509631} = 0,600717 → 3 876,926825 A
# ---------------------------------------------------------------------------
IKSS_ODLEGLA_A = 4563.542872
I_DC_ODLEGLA_A = {0.02: 6195.990888, 0.1: 5263.629609, 0.25: 3876.926825}
#: Dawna formuła (asymetryczny prąd wyłączeniowy) dla t_b = 0,1 s — wartość wstrzyknięcia.
DAWNA_FORMULA_TB_01_A = 5844.684014

CZASY_TB: tuple[float | None, ...] = (0.02, 0.1, 0.25, None)

#: Niezależna tablica krzywych IEC 60909-0:2016 § 6.6.1 (μ) i § 6.6.3 (q) — progi t_min
#: 0,02 / 0,05 / 0,10 / ≥ 0,25 s; przepisana z normy w tym teście, nie importowana z solvera.
_MU = {0.02: (0.84, 0.26, 0.26), 0.1: (0.62, 0.72, 0.32), 0.25: (0.56, 0.94, 0.38)}
_Q = {0.02: (1.03, 0.12), 0.1: (0.57, 0.12), 0.25: (0.26, 0.10)}

TOPOLOGIE: dict[str, list[dict[str, Any]]] = {
    "odlegla": [],
    "synchroniczna": [
        {
            "ref_id": "gen-sg",
            "name": "Generator synchroniczny G1",
            "p_mw": 4.0,
            "gen_type": "synchronous",
            "materialized_params": {
                "sn_mva": 5.0,
                "un_kv": 33.0,
                "cos_phi": 0.8,
                "xd_subtransient_pu": 0.15,
            },
        }
    ],
    "asynchroniczna": [
        {
            "ref_id": "gen-am",
            "name": "Maszyna asynchroniczna M1",
            "p_mw": 2.0,
            "gen_type": "fw_scig",
            "materialized_params": {"un_kv": 33.0, "i_lr_ratio": 5.0},
        }
    ],
    # Wiatrowa typu 3 (DFIG): przy zwarciu crowbar zwiera wirnik — maszyna asynchroniczna
    # za Z_M (§ 6.7), ta sama matematyka μ·q co klatkowa (inna etykieta).
    "dfig": [
        {
            "ref_id": "gen-dfig",
            "name": "Turbina wiatrowa DFIG",
            "p_mw": 2.0,
            "gen_type": "fw_dfig",
            "materialized_params": {"un_kv": 33.0, "i_lr_ratio": 5.0},
        }
    ],
    "przeksztaltnik": [
        {
            "ref_id": "gen-pv",
            "name": "Farma PV",
            "p_mw": 5.0,
            "gen_type": "pv_inverter",
            "connection_variant": "DEDICATED_MV_CONNECTION",
            "materialized_params": {"sn_mva": 5.0, "un_kv": 33.0, "k_sc": 1.1},
        }
    ],
}


def _migawka(topologia: str) -> tuple[dict[str, Any], str]:
    bench = build_iec60909_example_enm()
    migawka = EnergyNetworkModel.model_validate(bench.enm).model_dump(mode="json")
    szyna_sn = bench.bus_map["BUS-MV"]
    migawka["generators"] = [dict(g, bus_ref=szyna_sn) for g in TOPOLOGIE[topologia]]
    EnergyNetworkModel.model_validate(migawka)
    return migawka, _ref_to_uuid(szyna_sn)


def _bieg(migawka: dict[str, Any], tb_s: float | None) -> CanonicalRun:
    opcje: dict[str, Any] = {"fault_type": "SC_3F", "thermal_time_seconds": 1.0}
    if tb_s is not None:
        opcje["breaking_time_seconds"] = tb_s
    run = CanonicalRun(
        id=uuid.UUID(int=1),
        case_id="przypadek-tb",
        project_id="projekt-tb",
        analysis_type="short_circuit_sn",
        status="FINISHED",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        snapshot_hash="s",
        input_hash="i",
        snapshot=migawka,
        validation={},
        readiness={},
        options=opcje,
    )
    wykonaj_bieg_w_pamieci(run)
    return run


def _wiersz(run: CanonicalRun, wezel: str) -> dict[str, Any]:
    return next(r for r in run.raw_result["results"] if r["fault_node_id"] == wezel)


def _krok(wiersz: dict[str, Any], klucz: str) -> dict[str, Any]:
    kroki = [k for k in wiersz["white_box_trace"] if k.get("key") == klucz]
    assert len(kroki) == 1, f"krok {klucz!r} musi być w śladzie dokładnie raz"
    return kroki[0]


def _mu_reczne(krotnosc: float, tb_s: float) -> float:
    if krotnosc <= 2.0:
        return 1.0
    a, b, w = _MU[tb_s]
    return min(1.0, a + b * math.exp(-w * krotnosc))


def _q_reczne(p_na_pare_mw: float, tb_s: float) -> float:
    if p_na_pare_mw <= 0.0:
        return 1.0
    a, b = _Q[tb_s]
    return min(1.0, max(0.0, a + b * math.log(p_na_pare_mw)))


_PRZEBIEGI: dict[tuple[str, float | None], tuple[CanonicalRun, dict[str, Any], str]] = {}


def _przebieg(topologia: str, tb_s: float | None) -> tuple[CanonicalRun, dict[str, Any], str]:
    klucz = (topologia, tb_s)
    if klucz not in _PRZEBIEGI:
        migawka, wezel = _migawka(topologia)
        run = _bieg(migawka, tb_s)
        _PRZEBIEGI[klucz] = (run, _wiersz(run, wezel), wezel)
    return _PRZEBIEGI[klucz]


# ---------------------------------------------------------------------------
# Wyrocznia ręczna — sieć odległa od generatora
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("tb_s", CZASY_TB)
def test_wyrocznia_sieci_odleglej(tb_s: float | None) -> None:
    """I_b = I''k = 4 563,542872 A niezależnie od t_b; i_DC — rachunek ręczny do 6 cyfr."""
    _, wiersz, _ = _przebieg("odlegla", tb_s)
    assert wiersz["ikss_a"] == pytest.approx(IKSS_ODLEGLA_A, abs=5e-7)
    assert wiersz["ib_a"] == pytest.approx(IKSS_ODLEGLA_A, abs=5e-7)
    assert wiersz["ib_a"] != pytest.approx(DAWNA_FORMULA_TB_01_A, rel=1e-3)
    assert wiersz["tb_s"] == tb_s
    if tb_s is None:
        assert wiersz.get("i_dc_a") is None
    else:
        assert wiersz["i_dc_a"] == pytest.approx(I_DC_ODLEGLA_A[tb_s], abs=5e-7)


# ---------------------------------------------------------------------------
# Iloczyn topologia × t_b — wielkość w solverze i w śladzie White Box
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("tb_s", CZASY_TB)
@pytest.mark.parametrize("topologia", list(TOPOLOGIE))
def test_slad_ib_i_idc_niesie_te_sama_liczbe_co_wynik(topologia: str, tb_s: float | None) -> None:
    _, wiersz, _ = _przebieg(topologia, tb_s)
    krok_ib = _krok(wiersz, "Ib")
    krok_idc = _krok(wiersz, "iDC")
    assert krok_ib["result"]["ib_a"] == wiersz["ib_a"]
    assert krok_idc["result"]["i_dc_a"] == wiersz.get("i_dc_a")
    if tb_s is None:
        assert krok_idc["result"]["kod"] == KOD_CZAS_TB_BRAK
    else:
        # i_DC z prądu części Thevenina (sieć + maszyny) — przekształtnik nie ma składowej DC.
        ik_thevenin = wiersz["ik_thevenin_a"]
        reczne = (
            math.sqrt(2.0)
            * ik_thevenin
            * math.exp(-2.0 * math.pi * 50.0 * tb_s * wiersz["rx_ratio"])
        )
        assert wiersz["i_dc_a"] == pytest.approx(reczne, rel=1e-12)
        assert krok_idc["inputs"]["ikss_a"] == pytest.approx(ik_thevenin, rel=1e-15)


@pytest.mark.parametrize("tb_s", CZASY_TB)
@pytest.mark.parametrize("topologia", ["odlegla", "przeksztaltnik"])
def test_ib_bez_maszyn_rowne_pradowi_poczatkowemu(topologia: str, tb_s: float | None) -> None:
    """Bez maszyn wirujących I_b = I''k (z udziałem przekształtnika, bez zaniku) — także bez t_b."""
    _, wiersz, _ = _przebieg(topologia, tb_s)
    assert wiersz["ib_a"] == wiersz["ikss_a"]
    assert _krok(wiersz, "Ib")["inputs"]["przypadek"] == PRZYPADEK_IB_BEZ_MASZYN
    if topologia == "przeksztaltnik":
        assert wiersz["ikss_a"] > wiersz["ik_thevenin_a"]


@pytest.mark.parametrize("tb_s", CZASY_TB)
@pytest.mark.parametrize("topologia", ["synchroniczna", "asynchroniczna", "dfig"])
def test_ib_z_maszyna_wzor_rozdzialu_9(topologia: str, tb_s: float | None) -> None:
    """I_b = I''k − Σ ΔU''_m/(c·U_n/√3)·(1 − μ_m·q_m)·I''k,m z niezależnych krzywych μ i q."""
    _, wiersz, _ = _przebieg(topologia, tb_s)
    krok = _krok(wiersz, "Ib")
    assert krok["inputs"]["przypadek"] == PRZYPADEK_IB_MASZYNY
    if tb_s is None:
        assert wiersz["ib_a"] is None
        assert krok["result"] == {"ib_a": None, "kod": KOD_CZAS_TB_BRAK}
        return
    (maszyna,) = krok["inputs"]["maszyny"]
    mu = _mu_reczne(maszyna["ratio_ik_ir"], tb_s)
    assert maszyna["mu"] == pytest.approx(mu, rel=1e-12)
    if topologia == "synchroniczna":
        q = 1.0
    else:
        # P_rM/p = 2 MW (jedna para biegunów) — krzywa q § 6.6.3.
        q = _q_reczne(2.0, tb_s)
    assert maszyna["q"] == pytest.approx(q, rel=1e-12)
    reczne = wiersz["ikss_a"] - maszyna["delta_u_wzgledne"] * (1.0 - mu * q) * (
        maszyna["ikss_czesciowy_a"]
    )
    assert wiersz["ib_a"] == pytest.approx(reczne, rel=1e-12)
    assert wiersz["ib_a"] < wiersz["ikss_a"]


@pytest.mark.parametrize("topologia", ["synchroniczna", "asynchroniczna", "dfig"])
def test_ib_z_maszyna_maleje_z_czasem_wylaczenia(topologia: str) -> None:
    """Zanik składowej okresowej: dłuższe t_b → mniejsze I_b (krzywe μ, q maleją z t_min)."""
    wartosci = [_przebieg(topologia, tb)[1]["ib_a"] for tb in (0.02, 0.1, 0.25)]
    assert wartosci[0] > wartosci[1] > wartosci[2]


#: Prąd znamionowy maszyn fikstury [A] — rachunek ręczny: I_r = S_r/(sqrt(3)·U_r).
#: Synchroniczna: 5 MVA / (sqrt(3)·33 kV). Asynchroniczna/DFIG: S_rM = P_rM/(η·cosφ) =
#: 2 MW/(0,95·0,85) (domyślne η, cosφ modelu maszyny) / (sqrt(3)·33 kV).
_IR_MASZYNY_A = {
    "synchroniczna": 5.0e6 / (math.sqrt(3.0) * 33.0e3),
    "asynchroniczna": 2.0e6 / (0.95 * 0.85) / (math.sqrt(3.0) * 33.0e3),
    "dfig": 2.0e6 / (0.95 * 0.85) / (math.sqrt(3.0) * 33.0e3),
}


@pytest.mark.parametrize("topologia", ["synchroniczna", "asynchroniczna", "dfig"])
def test_krotnosc_mu_z_pradu_na_zaciskach_maszyny(topologia: str) -> None:
    """Zwarcie na szynie 110 kV, maszyna na 33 kV: krotność I''k/I_r krzywej μ liczy się
    z prądu NA ZACISKACH maszyny (poziom 33 kV, ten sam co I_r), nie z prądu odniesionego
    do miejsca zwarcia (110 kV) — ten sam prąd w drugiej bazie różni się o 110/33."""
    bench = build_iec60909_example_enm()
    migawka, _ = _migawka(topologia)
    wezel_wn = _ref_to_uuid(bench.bus_map["BUS-HV"])
    wiersz = _wiersz(_bieg(migawka, 0.1), wezel_wn)
    (maszyna,) = _krok(wiersz, "Ib")["inputs"]["maszyny"]
    prad_na_zaciskach_a = maszyna["ikss_czesciowy_a"] * 110.0 / 33.0
    assert maszyna["ratio_ik_ir"] == pytest.approx(
        prad_na_zaciskach_a / _IR_MASZYNY_A[topologia], rel=1e-9
    )
    assert maszyna["mu"] == pytest.approx(_mu_reczne(maszyna["ratio_ik_ir"], 0.1), rel=1e-12)


@pytest.mark.parametrize("tb_s", CZASY_TB)
@pytest.mark.parametrize("topologia", list(TOPOLOGIE))
def test_zalozenie_biegu_bez_tb_nazwane_kodem(topologia: str, tb_s: float | None) -> None:
    """Brak t_b = założenie biegu z kodem `fault.czas_tb_brak`, nigdy cicha stała 0,1 s."""
    run, _, _ = _przebieg(topologia, tb_s)
    kody = [z["code"] for z in run.raw_result.get("zalozenia", [])]
    if tb_s is None:
        assert KOD_CZAS_TB_BRAK in kody
    else:
        assert KOD_CZAS_TB_BRAK not in kody


# ---------------------------------------------------------------------------
# Kanały prezentacji: ResultSet, eksport raportowy, dowód SC3F
# ---------------------------------------------------------------------------


def _ka(a: float | None) -> float | None:
    return None if a is None else a / 1000.0


@pytest.mark.parametrize("tb_s", CZASY_TB)
@pytest.mark.parametrize("topologia", list(TOPOLOGIE))
def test_result_set_niesie_ib_idc_i_tb(topologia: str, tb_s: float | None) -> None:
    run, wiersz, wezel = _przebieg(topologia, tb_s)
    elementy = build_execution_result_set(run)["element_results"]
    (element,) = (e for e in elementy if e["solver_ref"] == wezel)
    wartosci = element["values"]
    assert wartosci["ib_ka"] == pytest.approx(_ka(wiersz["ib_a"]))
    assert wartosci["i_dc_ka"] == pytest.approx(_ka(wiersz.get("i_dc_a")))
    assert wartosci["tb_s"] == tb_s


@pytest.mark.parametrize("tb_s", CZASY_TB)
@pytest.mark.parametrize("topologia", list(TOPOLOGIE))
def test_eksport_glowna_linia_pokazuje_ib_i_idc(topologia: str, tb_s: float | None) -> None:
    run, wiersz, wezel = _przebieg(topologia, tb_s)
    (wiersz_raportu,) = (
        r for r in build_short_circuit_results(run)["rows"] if r["target_id"] == wezel
    )
    linia = _sc_row_glowne_linia(wiersz_raportu)
    if wiersz["ib_a"] is None:
        assert "Ib=— kA" in linia
    else:
        assert f"Ib={wiersz['ib_a'] / 1000.0:.6g} kA" in linia
    if wiersz.get("i_dc_a") is None:
        assert "iDC(tb)=— kA" in linia
    else:
        assert f"iDC(tb)={wiersz['i_dc_a'] / 1000.0:.6g} kA" in linia


@pytest.mark.parametrize("tb_s", CZASY_TB)
@pytest.mark.parametrize("topologia", list(TOPOLOGIE))
def test_dowod_sc3f_ta_sama_definicja_co_slad(topologia: str, tb_s: float | None) -> None:
    """Dowód SC3F (EQ_SC3F_014 I_b, EQ_SC3F_020 i_DC) niesie liczby wiersza biegu."""
    _, wiersz, wezel = _przebieg(topologia, tb_s)
    migawka, _ = _migawka(topologia)
    wynik = SC3FProofPack.generate(
        SC3FPackInput(
            project_name="Projekt t_b",
            case_name=f"{topologia} t_b={tb_s}",
            snapshot=migawka,
            fault_node_id=wezel,
            run_timestamp=datetime(2026, 1, 1),
            solver_version="test",
            scenariusz="MAX",
            nadpisanie_c=None,
            tk_s=1.0,
            tb_s=tb_s,
        )
    )
    kluczowe = wynik.proof_sc3f.summary.key_results
    kroki = {k.equation.equation_id for k in wynik.proof_sc3f.steps}
    if wiersz["ib_a"] is None:
        assert "ib_ka" not in kluczowe
        assert KOD_CZAS_TB_BRAK in wynik.odmowy
    else:
        assert kluczowe["ib_ka"].value == pytest.approx(wiersz["ib_a"] / 1000.0, rel=1e-12)
        assert "EQ_SC3F_014" in kroki
    if wiersz.get("i_dc_a") is None:
        assert "i_dc_ka" not in kluczowe
        assert KOD_CZAS_TB_BRAK in wynik.odmowy
    else:
        assert kluczowe["i_dc_ka"].value == pytest.approx(wiersz["i_dc_a"] / 1000.0, rel=1e-12)
        assert "EQ_SC3F_020" in kroki
    if tb_s is not None:
        assert wynik.odmowy == ()
        assert SC3FProofPack.validate_completeness(wynik) == []
