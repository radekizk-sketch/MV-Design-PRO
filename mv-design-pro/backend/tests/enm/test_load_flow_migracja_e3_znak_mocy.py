"""Konwencja znaku mocy wezlowej na torze kanonicznym — migracja fizyki z
dawnego testu E3 (karta W2, `ExecutionEngineService.execute_run_load_flow`,
`tests/test_execution_engine_load_flow_sign_convention.py`, kasacja karta
CV-3.3-A, 2026-09-05). E3 nie mial ANI JEDNEJ trasy HTTP ani konsumenta
produkcyjnego — zyl wylacznie w testach; R1 (`enm.canonical_analysis`) jest
jedynym torem produkcyjnym biegow.

SEDZIA. Testy nie ufaja mapowaniu ENM->PQSpec ani mocom zwracanym przez
solver. Bilans wezlowy jest liczony W TYM PLIKU w czystym numpy z parametrow
sieci (model PI galezi) oraz z napiec, ktore RAPORT sam podaje:
S_i = V_i * conj(sum_k Y_ik V_k). Zaden element badanego montazu ani solvera
nie jest uzyty — dokladnie tak samo jak w dawnym tescie E3.

ZAKRES (regula KLASA, NIE INSTANCJA) PRZENIESIONY z E3: odbior stalomocowy x
odbior ZIP (moc zadana != wstrzykniema) x kilka odbiorow na JEDNEJ szynie
(zwijanie wielu Load na jedna szyne) x galezie z pojemnoscia doziemna x
wezel tranzytowy {w srodku promienia, na koncu odgalezienia, dwa pod rzad}.

POMINIETE Z E3 (bez rownowaznika na torze kanonicznym — udokumentowane, nie
zamilczane): warianty "generator PV na wlasnej szynie" z REGULACJA NAPIECIA
(klasyczna szyna PV solvera, `PVSpec`) — kanoniczny assembler
(`enm/canonical_analysis.py::_execute_power_flow`) NIGDY nie buduje `PVSpec`
(`pv_bus_ids=[]` zawsze — dlug nazwany A3-04 w
`docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md` §C.2.3, zamykany w CV-4).
Fizyka szyny PV solvera (Q z rownania wezlowego, przelaczenie PV->PQ na
granicy Q) jest niezaleznie i wyczerpujaco dowiedziona na poziomie SOLVERA
(FROZEN, wspolnego dla obu torow) w `tests/test_power_flow_v2.py` i
`tests/test_power_flow_fast_decoupled.py` (`pv_to_pq_switches`,
`PVSpec`/`PQSpec` bezposrednio na `PowerFlowInput`) — kasacja E3 NIE
zmniejsza tej fizyki. „Generacja" tu jest wiec fixed-injection (ENM
`Generator` bez regulacji, konwencja generatorowa) — realny i pelnoprawny
przypadek kanonu, nie namiastka szyny PV.

Tor: `set_enm` + `create_run(..., klucz_twin=)` + `execute_run`
(`enm.canonical_analysis`) — jedyny tor produkcyjny biegow (R1).
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
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    Load,
    OverheadLine,
    Source,
)
from enm.store import reset_enm_store, set_enm

from tests.catalog_test_helpers import gpz_source_record

BASE_MVA = 100.0
UN_KV = 15.0
R_PER_KM = 0.08
X_PER_KM = 0.32
LEN_KM = 5.0

# Tolerancja porownania z sedzia. Solver zbiega do 1e-8 pu na niezbilansowaniu,
# co przy S_b = 100 MVA daje 1e-6 MW; bierzemy 1e-6 MW z zapasem rzedu wielkosci
# (ten sam zapas co dawny test E3).
TOL_MW = 1e-5


@pytest.fixture(autouse=True)
def _reset_state():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _linia(ref_id: str, *, od: str, do: str, b_siemens_per_km: float | None = None) -> OverheadLine:
    return OverheadLine(
        ref_id=ref_id,
        name=f"Linia {ref_id}",
        from_bus_ref=od,
        to_bus_ref=do,
        length_km=LEN_KM,
        r_ohm_per_km=R_PER_KM,
        x_ohm_per_km=X_PER_KM,
        b_siemens_per_km=b_siemens_per_km,
        catalog_ref="linia-sn-referencyjna",
        catalog_namespace="LINIA_SN",
        parameter_source="CATALOG",
    )


def _zrodlo(bus_ref: str = "slack") -> Source:
    return Source(
        **gpz_source_record(
            ref_id="src", name="System 15 kV", bus_ref=bus_ref, voltage_kv=UN_KV, sk3_mva=500.0
        )
    )


ZIP_STALA_IMPEDANCJA = {"a_p": 1.0, "b_p": 0.0, "c_p": 0.0, "a_q": 1.0, "b_q": 0.0, "c_q": 0.0}

# Galaz z NIEZEROWA pojemnoscia doziemna (model PI z galezia poprzeczna) —
# zeby sedzia nie byl przypadkiem zgodny tylko dla galezi czysto szeregowej.
# 120 uS/km = 120e-6 S/km (`enm/mapping.py` mnozy `b_siemens_per_km` x1e6).
B_Z_POJEMNOSCIA_S_PER_KM = 120e-6


def _sieci_iloczyn_cech() -> dict[str, EnergyNetworkModel]:
    """Radialna slack->n1->n2, jak w dawnym E3, ILOCZYN CECH odbioru/galezi."""

    def _siec(loads: list[Load], *, b_siemens_per_km: float | None = None) -> EnergyNetworkModel:
        return EnergyNetworkModel(
            header=ENMHeader(name="W2 kanon"),
            buses=[
                Bus(ref_id="slack", name="Slack", voltage_kv=UN_KV),
                Bus(ref_id="n1", name="N1", voltage_kv=UN_KV),
                Bus(ref_id="n2", name="N2", voltage_kv=UN_KV),
            ],
            sources=[_zrodlo()],
            loads=loads,
            branches=[
                _linia("l1", od="slack", do="n1", b_siemens_per_km=b_siemens_per_km),
                _linia("l2", od="n1", do="n2", b_siemens_per_km=b_siemens_per_km),
            ],
        )

    return {
        "odbiory stalomocowe": _siec(
            [
                Load(ref_id="ld1", name="L1", bus_ref="n1", p_mw=2.0, q_mvar=0.8),
                Load(ref_id="ld2", name="L2", bus_ref="n2", p_mw=1.5, q_mvar=0.6),
            ]
        ),
        "odbior ZIP stalej impedancji": _siec(
            [
                Load(ref_id="ld1", name="L1", bus_ref="n1", p_mw=2.0, q_mvar=0.8),
                Load(
                    ref_id="ld2",
                    name="L2",
                    bus_ref="n2",
                    p_mw=1.5,
                    q_mvar=0.6,
                    model="zip",
                    materialized_params=dict(ZIP_STALA_IMPEDANCJA),
                ),
            ]
        ),
        "dwa odbiory na jednej szynie": _siec(
            [
                Load(ref_id="ld1a", name="L1a", bus_ref="n1", p_mw=1.2, q_mvar=0.5),
                Load(ref_id="ld1b", name="L1b", bus_ref="n1", p_mw=0.8, q_mvar=0.3),
                Load(ref_id="ld2", name="L2", bus_ref="n2", p_mw=1.5, q_mvar=0.6),
            ]
        ),
        "galezie z pojemnoscia doziemna": _siec(
            [
                Load(ref_id="ld1", name="L1", bus_ref="n1", p_mw=2.0, q_mvar=0.8),
                Load(ref_id="ld2", name="L2", bus_ref="n2", p_mw=1.5, q_mvar=0.6),
            ],
            b_siemens_per_km=B_Z_POJEMNOSCIA_S_PER_KM,
        ),
    }


def _uruchom(klucz: str, enm: EnergyNetworkModel):
    set_enm(klucz, enm)
    run = execute_run(
        create_run(
            case_id=klucz, klucz_twin=klucz, analysis_type="PF", options={"base_mva": BASE_MVA}
        ).id
    )
    assert run.status == "FINISHED", run.error_message
    return run


def _bus_by_ref(run) -> dict[str, dict]:
    """Wiersze `bus_results` skluczowane po ENM `ref_id` (nie po id grafu)."""
    wiersze = {b["bus_id"]: b for b in run.raw_result["result_v1"]["bus_results"]}
    enm = EnergyNetworkModel.model_validate(run.snapshot)
    return {bus.ref_id: wiersze[_graph_id_from_ref(bus.ref_id)] for bus in enm.buses}


# ---------------------------------------------------------------------------
# SEDZIA — niezalezny bilans wezlowy liczony w tym pliku
# ---------------------------------------------------------------------------


def _sedzia_bilans_wezlowy(enm: EnergyNetworkModel, szyny: dict[str, dict]) -> dict[str, complex]:
    """S_i = V_i * conj(sum_k Y_ik V_k) [MVA], konwencja INJEKCJI.

    Y-bus skladany tu OD ZERA z parametrow sieci ENM (model PI: admitancja
    szeregowa 1/((r+jx)*L) oraz polowa susceptancji b*L na kazdym koncu),
    napiecia brane z RAPORTU. Zaden element badanego montazu ani solvera nie
    jest uzyty.
    """
    z_base = (UN_KV * UN_KV) / BASE_MVA
    refy = sorted(bus.ref_id for bus in enm.buses)
    idx = {ref: i for i, ref in enumerate(refy)}
    y = np.zeros((len(refy), len(refy)), dtype=complex)
    for branch in enm.branches:
        if branch.status != "closed":
            continue
        z_ohm = complex(
            branch.r_ohm_per_km * branch.length_km, branch.x_ohm_per_km * branch.length_km
        )
        y_ser = (1.0 / z_ohm) * z_base
        b_s_per_km = branch.b_siemens_per_km or 0.0
        y_sh_konca = complex(0.0, b_s_per_km * branch.length_km / 2.0) * z_base
        i_od, i_do = idx[branch.from_bus_ref], idx[branch.to_bus_ref]
        y[i_od, i_od] += y_ser + y_sh_konca
        y[i_do, i_do] += y_ser + y_sh_konca
        y[i_od, i_do] -= y_ser
        y[i_do, i_od] -= y_ser

    v = np.zeros(len(refy), dtype=complex)
    for ref in refy:
        wiersz = szyny[ref]
        v[idx[ref]] = wiersz["v_pu"] * np.exp(1j * math.radians(wiersz["angle_deg"]))

    s_pu = v * np.conj(y @ v)
    return {ref: complex(s_pu[idx[ref]] * BASE_MVA) for ref in refy}


# ---------------------------------------------------------------------------
# Test rozstrzygajacy — moc wezlowa zgadza sie z niezaleznym bilansem
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("nazwa", sorted(_sieci_iloczyn_cech()))
def test_moc_wezlowa_zgadza_sie_z_niezaleznym_bilansem(nazwa: str) -> None:
    """Kazda raportowana moc czynna/bierna wezla = moc wynikajaca z fizyki
    przy tym napieciu. Gdyby znak byl odwrocony, odbior 2,0 MW raportowany
    bylby jako +2,0 MW przy sedzim -2,0 MW i asercja padnie z roznica 4,0 MW."""
    enm = _sieci_iloczyn_cech()[nazwa]
    run = _uruchom(f"w2-bilans-{hash(nazwa) & 0xffff}", enm)
    szyny = _bus_by_ref(run)
    sedzia = _sedzia_bilans_wezlowy(enm, szyny)

    for ref, wiersz in szyny.items():
        assert wiersz["p_injected_mw"] == pytest.approx(sedzia[ref].real, abs=TOL_MW), (
            f"{nazwa}: szyna {ref} raportuje P={wiersz['p_injected_mw']:.6f} MW, a fizyka "
            f"przy |V|={wiersz['v_pu']:.6f} pu daje {sedzia[ref].real:.6f} MW"
        )
        assert wiersz["q_injected_mvar"] == pytest.approx(sedzia[ref].imag, abs=TOL_MW), (
            f"{nazwa}: szyna {ref} raportuje Q={wiersz['q_injected_mvar']:.6f} Mvar, a fizyka "
            f"daje {sedzia[ref].imag:.6f} Mvar"
        )


@pytest.mark.parametrize("nazwa", sorted(_sieci_iloczyn_cech()))
def test_suma_wstrzyknien_rowna_stratom_sieci(nazwa: str) -> None:
    """Bilans calej sieci: suma mocy wstrzykniętych = straty. Najostrzejszy
    detektor odwroconego znaku — przy odbiorach wchodzacych dodatnio zamiast
    ujemnie suma bylaby zawyzona o podwojona moc odbiorow."""
    enm = _sieci_iloczyn_cech()[nazwa]
    run = _uruchom(f"w2-straty-{hash(nazwa) & 0xffff}", enm)
    szyny = _bus_by_ref(run)

    suma = sum(w["p_injected_mw"] for w in szyny.values())
    straty = run.raw_result["result_v1"]["summary"]["total_losses_p_mw"]
    assert suma == pytest.approx(
        straty, abs=TOL_MW
    ), f"{nazwa}: suma wstrzyknien {suma:.6f} MW != straty {straty:.6f} MW"


def test_odbior_ujemny_generacja_dodatnia_slack_dodatni() -> None:
    """Kontrakt FROZEN „ujemna = pobor" (power_flow_result.py) — wprost.
    Generacja tu jest fixed-injection (ENM `Generator` bez regulacji napiecia
    — patrz naglowek modulu: klasyczna szyna PV solvera nie ma dzis
    rownowaznika na torze kanonicznym, dowiedziona niezaleznie na solverze)."""
    enm = EnergyNetworkModel(
        header=ENMHeader(name="W2 kanon - generacja"),
        buses=[
            Bus(ref_id="slack", name="Slack", voltage_kv=UN_KV),
            Bus(ref_id="n1", name="N1", voltage_kv=UN_KV),
            Bus(ref_id="n2", name="N2", voltage_kv=UN_KV),
        ],
        sources=[_zrodlo()],
        loads=[Load(ref_id="ld1", name="L1", bus_ref="n1", p_mw=2.0, q_mvar=0.8)],
        generators=[Generator(ref_id="gen2", name="G2", bus_ref="n2", p_mw=1.0, q_mvar=0.0)],
        branches=[_linia("l1", od="slack", do="n1"), _linia("l2", od="n1", do="n2")],
    )
    run = _uruchom("w2-generacja", enm)
    szyny = _bus_by_ref(run)

    assert szyny["n1"]["p_injected_mw"] < 0.0, "odbior musi miec moc wstrzykniema UJEMNA"
    assert szyny["n1"]["p_injected_mw"] == pytest.approx(-2.0, abs=TOL_MW)
    assert szyny["n2"]["p_injected_mw"] > 0.0, "generacja musi miec moc wstrzykniema DODATNIA"
    assert szyny["n2"]["p_injected_mw"] == pytest.approx(1.0, abs=TOL_MW)
    assert szyny["slack"]["p_injected_mw"] > 0.0, "slack zasilajacy siec wstrzykuje dodatnio"
    assert szyny["n1"]["q_injected_mvar"] == pytest.approx(-0.8, abs=TOL_MW)


def test_moc_szyny_zip_to_moc_wstrzykniema_a_nie_zadana() -> None:
    """Na szynie ZIP raport pokazuje moc PO wielomianie napieciowym, nie moc
    ZADANA — klasa defektu W2/D1: slownik skladany z mocy zadanej raportowalby
    1,5 MW przy faktycznym wstrzyknieciu innym (skalowanym |V|^2)."""
    enm = _sieci_iloczyn_cech()["odbior ZIP stalej impedancji"]
    run = _uruchom("w2-zip-wartosc", enm)
    szyna = _bus_by_ref(run)["n2"]

    assert szyna["v_pu"] < 1.0, "bez spadku napiecia wielomian ZIP nie zmienia mocy"
    assert szyna["p_injected_mw"] != pytest.approx(
        -1.5, abs=1e-3
    ), "raport pokazuje moc ZADANA zamiast wstrzykniemej — wielomian ZIP pominiety"
    assert szyna["p_injected_mw"] == pytest.approx(
        -1.5 * szyna["v_pu"] ** 2, rel=1e-6
    ), "przy a_p=1 moc wstrzykniema musi skalowac sie kwadratem napiecia"


# ---------------------------------------------------------------------------
# Wezly tranzytowe — zero jest FAKTEM potwierdzonym przez sedziego, nie cichym
# domyslnym zerem
# ---------------------------------------------------------------------------


def test_szyna_tranzytowa_ma_zerowe_wstrzykniecie() -> None:
    """Szyna bez zadnego odbioru/zrodla: 0,0 jest tam PRAWDA potwierdzona przez
    sedziego, nie cichy default nienadpisanego pola."""
    enm = EnergyNetworkModel(
        header=ENMHeader(name="W2 kanon - tranzyt zero"),
        buses=[
            Bus(ref_id="slack", name="Slack", voltage_kv=UN_KV),
            Bus(ref_id="n1", name="N1", voltage_kv=UN_KV),
            Bus(ref_id="n2", name="N2", voltage_kv=UN_KV),
        ],
        sources=[_zrodlo()],
        loads=[Load(ref_id="ld2", name="L2", bus_ref="n2", p_mw=1.5, q_mvar=0.6)],
        branches=[_linia("l1", od="slack", do="n1"), _linia("l2", od="n1", do="n2")],
    )
    run = _uruchom("w2-tranzyt-zero", enm)
    szyny = _bus_by_ref(run)
    sedzia = _sedzia_bilans_wezlowy(enm, szyny)

    assert szyny["n1"]["p_injected_mw"] == pytest.approx(0.0, abs=TOL_MW)
    assert szyny["n1"]["q_injected_mvar"] == pytest.approx(0.0, abs=TOL_MW)
    assert sedzia["n1"].real == pytest.approx(0.0, abs=TOL_MW)
    assert sedzia["n1"].imag == pytest.approx(0.0, abs=TOL_MW)


def test_wezly_tranzytowe_iloczyn_cech() -> None:
    """ILOCZYN CECH polozenia wezla bez odbioru (regula KLASA pkt 2): tranzyt
    W SRODKU promienia, na KONCU odgalezienia (galaz slepa), oraz DWA wezly
    tranzytowe pod rzad. W kazdym przypadku sedzia liczy bilans niezaleznie i
    slack pokrywa caly odbior sieci."""
    warianty: dict[str, tuple[EnergyNetworkModel, tuple[str, ...], float]] = {
        "tranzyt w srodku promienia": (
            EnergyNetworkModel(
                header=ENMHeader(name="W2 kanon - tranzyt srodek"),
                buses=[
                    Bus(ref_id="slack", name="Slack", voltage_kv=UN_KV),
                    Bus(ref_id="n1", name="N1", voltage_kv=UN_KV),
                    Bus(ref_id="n2", name="N2", voltage_kv=UN_KV),
                ],
                sources=[_zrodlo()],
                loads=[Load(ref_id="ld2", name="L2", bus_ref="n2", p_mw=1.5, q_mvar=0.6)],
                branches=[_linia("l1", od="slack", do="n1"), _linia("l2", od="n1", do="n2")],
            ),
            ("n1",),
            1.5,
        ),
        "tranzyt na koncu odgalezienia": (
            EnergyNetworkModel(
                header=ENMHeader(name="W2 kanon - tranzyt koniec"),
                buses=[
                    Bus(ref_id="slack", name="Slack", voltage_kv=UN_KV),
                    Bus(ref_id="n1", name="N1", voltage_kv=UN_KV),
                    Bus(ref_id="koniec", name="Koniec", voltage_kv=UN_KV),
                ],
                sources=[_zrodlo()],
                loads=[Load(ref_id="ld1", name="L1", bus_ref="n1", p_mw=2.0, q_mvar=0.8)],
                branches=[_linia("l1", od="slack", do="n1"), _linia("l2", od="n1", do="koniec")],
            ),
            ("koniec",),
            2.0,
        ),
        "dwa wezly tranzytowe pod rzad": (
            EnergyNetworkModel(
                header=ENMHeader(name="W2 kanon - tranzyt x2"),
                buses=[
                    Bus(ref_id="slack", name="Slack", voltage_kv=UN_KV),
                    Bus(ref_id="t1", name="T1", voltage_kv=UN_KV),
                    Bus(ref_id="t2", name="T2", voltage_kv=UN_KV),
                    Bus(ref_id="odbiorca", name="Odbiorca", voltage_kv=UN_KV),
                ],
                sources=[_zrodlo()],
                loads=[Load(ref_id="ldx", name="Lx", bus_ref="odbiorca", p_mw=1.2, q_mvar=0.5)],
                branches=[
                    _linia("l1", od="slack", do="t1"),
                    _linia("l2", od="t1", do="t2"),
                    _linia("l3", od="t2", do="odbiorca"),
                ],
            ),
            ("t1", "t2"),
            1.2,
        ),
    }

    for nazwa, (enm, tranzytowe, odbior_mw) in warianty.items():
        run = _uruchom(f"w2-tranzyt-{hash(nazwa) & 0xffff}", enm)
        szyny = _bus_by_ref(run)
        sedzia = _sedzia_bilans_wezlowy(enm, szyny)

        for ref in tranzytowe:
            assert szyny[ref]["p_injected_mw"] == pytest.approx(
                0.0, abs=TOL_MW
            ), f"{nazwa}: {ref} nie jest zerem w raporcie"
            assert sedzia[ref].real == pytest.approx(
                0.0, abs=TOL_MW
            ), f"{nazwa}: {ref} nie jest zerem wg sedziego"
        assert szyny["slack"]["p_injected_mw"] == pytest.approx(
            sedzia["slack"].real, abs=TOL_MW
        ), f"{nazwa}: slack rozjechany z sedzia"
        assert szyny["slack"]["p_injected_mw"] > odbior_mw - TOL_MW, nazwa


# ---------------------------------------------------------------------------
# Determinizm i pin kontraktu FROZEN
# ---------------------------------------------------------------------------


def test_wynik_jest_deterministyczny_po_naprawie() -> None:
    """Ta sama siec dwa razy — identyczne moce wezlowe co do bitu."""
    enm = _sieci_iloczyn_cech()["dwa odbiory na jednej szynie"]
    pierwszy = _uruchom("w2-det-a", enm)
    drugi = _uruchom("w2-det-b", enm)
    assert pierwszy.raw_result["result_v1"]["bus_results"] == (
        drugi.raw_result["result_v1"]["bus_results"]
    )


def test_parytet_znaku_ze_sciezka_kanoniczna() -> None:
    """Pin kontraktu FROZEN na torze kanonicznym: odbior 2,0 MW raportuje
    wstrzykniecie -2,0 MW, slack dodatnie — byl test parytetu E3-vs-kanon
    (karta W2); polowa E3 skasowana razem z silnikiem, polowa kanoniczna
    zostaje jako niezalezny pin."""
    p_mw, q_mvar = 2.0, 0.8
    enm = EnergyNetworkModel(
        header=ENMHeader(name="W2 kanon - parytet"),
        buses=[
            Bus(ref_id="b1", name="GPZ", voltage_kv=UN_KV),
            Bus(ref_id="b2", name="Odbiorca", voltage_kv=UN_KV),
        ],
        sources=[_zrodlo(bus_ref="b1")],
        loads=[Load(ref_id="load-1", name="Odbior", bus_ref="b2", p_mw=p_mw, q_mvar=q_mvar)],
        branches=[_linia("ln-1", od="b1", do="b2")],
    )
    run = _uruchom("w2-parytet", enm)
    szyny = _bus_by_ref(run)

    assert szyny["b2"]["p_injected_mw"] == pytest.approx(-p_mw, abs=TOL_MW)
    assert szyny["b2"]["q_injected_mvar"] == pytest.approx(-q_mvar, abs=TOL_MW)
    assert szyny["b1"]["p_injected_mw"] > 0.0, "slack zasilajacy siec wstrzykuje dodatnio"


def test_parytet_z_wezlem_tranzytowym_ze_sciezka_kanoniczna() -> None:
    """Bramka (c) karty X2 na torze kanonicznym: zbior wezlow WEJSCIA solvera
    pochodzi z TOPOLOGII, wiec szyna tranzytowa (bez wpisu odbioru) dostaje
    specyfikacje PQ zerowa i NIE zachowuje sie jak drugi wezel bilansujacy —
    jej napiecie jest WYNIKIEM zbieznosci, nie startem plaskim."""
    p_mw, q_mvar = 1.5, 0.6
    enm = EnergyNetworkModel(
        header=ENMHeader(name="W2 kanon - parytet tranzyt"),
        buses=[
            Bus(ref_id="b1", name="GPZ", voltage_kv=UN_KV),
            Bus(ref_id="b2", name="Tranzyt", voltage_kv=UN_KV),
            Bus(ref_id="b3", name="Odbiorca za tranzytem", voltage_kv=UN_KV),
        ],
        sources=[_zrodlo(bus_ref="b1")],
        loads=[Load(ref_id="load-1", name="Odbior", bus_ref="b3", p_mw=p_mw, q_mvar=q_mvar)],
        branches=[_linia("ln-1", od="b1", do="b2"), _linia("ln-2", od="b2", do="b3")],
    )
    run = _uruchom("w2-parytet-tranzyt", enm)
    szyny = _bus_by_ref(run)

    assert run.raw_result["pv_to_pq_switches"] == []
    assert szyny["b2"]["p_injected_mw"] == pytest.approx(0.0, abs=TOL_MW)
    assert szyny["b3"]["p_injected_mw"] == pytest.approx(-p_mw, abs=TOL_MW)
    assert szyny["b3"]["q_injected_mvar"] == pytest.approx(-q_mvar, abs=TOL_MW)
    # Parytet nie moze byc spelniony „na plasko": napiecie tranzytu jest WYNIKIEM.
    assert szyny["b2"]["v_pu"] < 1.0 - 1e-6
