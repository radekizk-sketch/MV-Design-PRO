"""Wkład zwarciowy per źródło (karta WKLAD-ZRODLA, zgoda B-01 architekta 2026-10-22).

Wzorzec GPZ w układzie H5 (dwa tory 110 kV, L1 i L2, każdy z własnym równoważnikiem na
własnej sekcji): inżynier musi widzieć wkład KAŻDEGO toru do prądu zwarciowego, a rdzeń
dotąd agregował źródła sieciowe do jednego wpisu ``THEVENIN_GRID``.

Wzór (IEC 60909-0:2016 §4.2, metoda zastępczego źródła napięcia): I_Q,k = Y_Q,k·Z_kf·I_k''(Th)
— admitancja bocznika źródła k × impedancja wzajemna węzła źródła i węzła zwarcia (kolumna f
macierzy Z-bus) × prąd części Thevenina. Ten sam wzór dla maszyn wirujących (Y″ = 1/Z″).

ILOCZYN CECH (reguła KLASA, NIE INSTANCJA):
- układ zasilania {jedno źródło, dwa źródła w jednej wyspie, dwa źródła w różnych wyspach
  (H5, łączniki otwarte), dwa źródła + maszyna synchroniczna};
- rodzaj zwarcia {3F, 1F, 2F, 2F+Z} — rdzeń liczy wkłady we wszystkich czterech;
- scenariusz {MAX (c = 1,1; Z_Q), MIN (c = 1,0; 1,6·Z_Q)};
- punkt zwarcia {szyna SN sekcji A, pole za kablem}.
Asercje na każdym elemencie iloczynu: bilans fazorowy (z wkładami pominiętymi) = I_k''(Th)
w tolerancji kontraktu bilansu; wpis źródła z innej wyspy = 0 z przyczyną; JEDEN predykat
progu (klasa wpisu ↔ `jest_wkladem_pominietym` na surowym |I| ze śladu); udział = I/I_k''.
Rachunek niezależny: dzielnik prądu i ręczne odwrócenie 2×2 macierzy Y sieci dwuwęzłowej.
Człony poprzeczne gałęzi (pojemność kabla, przekładnia poza-znamionowa) — osobny iloczyn;
szyna sztywna (węzeł SLACK bez Z_Q) z maszyną na tej szynie i bez; rozbicie admitancji na
źródła równe stemplowi macierzy (para predykatów: zbiór źródeł w macierzy i w wyniku).

WSTRZYKNIĘCIA (meldunek karty) — każde czerwieni ten moduł: Z_ff zamiast Z_kf
(`test_dzielnik_pradu_sieci_dwuwezlowej` i iloczyn bilansu), drugi próg
(`test_prog_wkladu_zrodla_jeden_predykat`), pominięcie maszyn w sumie bilansu
(`test_bilans_wkladow_zrodel_iloczyn_cech`, `test_szyna_sztywna_*`), pominięcie maszyn
w zbiorze źródeł (`test_rozbicie_na_zrodla_rowne_stemplowi_macierzy` i bilans).
"""

from __future__ import annotations

import cmath
import hashlib
import json
import math
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
from network_model.core.branch import BranchType, LineBranch
from network_model.core.czas_wylaczenia import czas_tb_roboczy
from network_model.core.graph import NetworkGraph
from network_model.core.grid_source import GridShortCircuitSource
from network_model.core.node import Node, NodeType
from network_model.solvers.machine_sc_iec60909 import compute_machine_contributions
from network_model.solvers.short_circuit_contributions import (
    KLASA_WKLADU_ZRODLA,
    KLASA_WKLADU_ZRODLA_INNA_WYSPA,
    KLASA_WKLADU_ZRODLA_POMINIETY,
    NAZWA_WKLADU_POMINIETEGO,
    PROG_WKLADU_POMIJALNEGO_A,
    PRZYCZYNA_WKLADU_INNA_WYSPA,
    RODZAJ_BOCZNIKA_MASZYNA_SYNCHRONICZNA,
    RODZAJ_BOCZNIKA_SIEC,
    RODZAJ_BOCZNIKA_SZYNA_SZTYWNA,
    admitancje_zrodel_macierzy,
    boczniki_zrodel,
    jest_wkladem_pominietym,
    tolerancja_bilansu_a,
)
from network_model.solvers.short_circuit_core import build_zbus
from network_model.solvers.short_circuit_iec60909 import (
    OPTIONAL_SHORT_CIRCUIT_RESULT_KEYS,
    ShortCircuitIEC60909Solver,
    ShortCircuitResult,
)

from tests.utils.siec_h5_wkladow_zrodel import fazor, siec_h5

UKLADY: dict[str, dict[str, Any]] = {
    "jedno_zrodlo": {"liczba_zrodel": 1, "lacznik_110kv": True},
    "dwa_zrodla_jedna_wyspa": {"lacznik_sn": True},
    "dwa_zrodla_rozne_wyspy": {},
    "dwa_zrodla_i_maszyna": {"lacznik_sn": True, "maszyna": True},
}
#: Źródła oczekiwane w wyniku per układ — zbiór STAŁY (z modelu), nie z liczb.
ZRODLA_UKLADU: dict[str, set[str]] = {
    "jedno_zrodlo": {"ZR_L1"},
    "dwa_zrodla_jedna_wyspa": {"ZR_L1", "ZR_L2"},
    "dwa_zrodla_rozne_wyspy": {"ZR_L1", "ZR_L2"},
    "dwa_zrodla_i_maszyna": {"ZR_L1", "ZR_L2", "GS_B"},
}
RODZAJE = ("3F", "1F", "2F", "2F+Z")
#: Scenariusz → (mnożnik Z_Q, współczynnik c).
SCENARIUSZE: dict[str, tuple[float, float]] = {"MAX": (1.0, 1.1), "MIN": (1.6, 1.0)}
PUNKTY = ("SN_A", "POLE")
KLUCZE_NOWE = {"wklady_zrodel", "wklady_zrodel_slad"}


def _licz(
    graf: NetworkGraph, rodzaj: str, punkt: str, c: float, *, wklady: bool = True
) -> ShortCircuitResult:
    solver = ShortCircuitIEC60909Solver
    wspolne: dict[str, Any] = {
        "graph": graf,
        "fault_node_id": punkt,
        "c_factor": c,
        "tk_s": 1.0,
        "czas_tb": czas_tb_roboczy(),
        "include_branch_contributions": wklady,
    }
    if rodzaj == "3F":
        return solver.compute_3ph_short_circuit(**wspolne)
    if rodzaj == "2F":
        return solver.compute_2ph_short_circuit(**wspolne)
    z0_bus = build_zbus(graf)[1] * 3.0
    if rodzaj == "1F":
        return solver.compute_1ph_short_circuit(**wspolne, z0_bus=z0_bus)
    return solver.compute_2ph_ground_short_circuit(**wspolne, z0_bus=z0_bus)


def _krok(wynik: ShortCircuitResult, klucz: str) -> dict[str, Any]:
    assert wynik.wklady_zrodel_slad is not None
    (krok,) = (k for k in wynik.wklady_zrodel_slad if k["key"] == klucz)
    return krok


def _iloczyn() -> Iterator[tuple[str, str, str, str]]:
    for uklad in UKLADY:
        for rodzaj in RODZAJE:
            for scenariusz in SCENARIUSZE:
                for punkt in PUNKTY:
                    yield uklad, rodzaj, scenariusz, punkt


@pytest.mark.parametrize(("uklad", "rodzaj", "scenariusz", "punkt"), list(_iloczyn()))
def test_bilans_wkladow_zrodel_iloczyn_cech(
    uklad: str, rodzaj: str, scenariusz: str, punkt: str
) -> None:
    skala, c = SCENARIUSZE[scenariusz]
    wynik = _licz(siec_h5(skala_zq=skala, **UKLADY[uklad]), rodzaj, punkt, c)
    wpisy = wynik.wklady_zrodel
    assert wpisy is not None
    assert {w.source_id for w in wpisy} == ZRODLA_UKLADU[uklad]

    # Bilans liczony W TEŚCIE z wpisów wyniku (fazory ze stopni) — niezależnie od kroku
    # bilansu rdzenia; sieć bez członów poprzecznych (przekładnie znamionowe, b = 0) — człon
    # z sumy kolumnowej macierzy to wtedy wyłącznie reszta zaokrągleń (rząd 1e-12 A).
    bilans = _krok(wynik, "wklady_zrodel_bilans")["result"]
    suma = sum((fazor(w.i_a, w.kat_deg) for w in wpisy), 0j)
    tolerancja = tolerancja_bilansu_a(wynik.ik_thevenin_a)
    assert abs(bilans["prad_czlonow_poprzecznych_a"]) <= tolerancja
    assert abs(suma - wynik.ik_thevenin_a) <= tolerancja, (suma, wynik.ik_thevenin_a)
    assert bilans["bilans_domkniety"] is True
    assert bilans["reszta_a"] <= bilans["tolerancja_a"] == tolerancja
    assert wynik.ik_total_a == wynik.ik_thevenin_a + wynik.ik_inverters_a

    for wpis in wpisy:
        assert wpis.udzial == pytest.approx(wpis.i_a / wynik.ik_total_a, rel=1e-12, abs=1e-15)
        krok = _krok(wynik, f"wklad_zrodla_{wpis.source_id}")
        if wpis.klasa == KLASA_WKLADU_ZRODLA_INNA_WYSPA:
            assert (wpis.i_a, wpis.i_zaciski_a, wpis.kat_deg, wpis.udzial) == (0.0, 0.0, None, 0.0)
            assert wpis.przyczyna == PRZYCZYNA_WKLADU_INNA_WYSPA
            assert krok["notes"] == PRZYCZYNA_WKLADU_INNA_WYSPA
            continue
        # JEDEN predykat progu: klasa wpisu ↔ `jest_wkladem_pominietym` na SUROWYM |I| ze śladu.
        surowy = krok["result"]["i_a"]
        assert (wpis.klasa == KLASA_WKLADU_ZRODLA_POMINIETY) is jest_wkladem_pominietym(surowy)
        assert wpis.klasa in {KLASA_WKLADU_ZRODLA, KLASA_WKLADU_ZRODLA_POMINIETY}

    # Źródło z innej wyspy: wyłącznie w układzie H5 z otwartymi łącznikami — i tylko L2
    # (węzły zwarcia leżą w sekcji A); w pozostałych układach każde źródło ma drogę.
    inna_wyspa = {w.source_id for w in wpisy if w.klasa == KLASA_WKLADU_ZRODLA_INNA_WYSPA}
    assert inna_wyspa == ({"ZR_L2"} if uklad == "dwa_zrodla_rozne_wyspy" else set())
    if uklad in {"jedno_zrodlo", "dwa_zrodla_rozne_wyspy"}:
        (l1,) = (w for w in wpisy if w.source_id == "ZR_L1")
        assert l1.i_a == pytest.approx(wynik.ik_thevenin_a, rel=1e-12)


@pytest.mark.parametrize("rodzaj", RODZAJE)
@pytest.mark.parametrize(
    "wariant",
    [
        {"lacznik_110kv": True, "przekladnia_poza_znamionowa": True, "maszyna": True},
        {"lacznik_sn": True, "b_kabla_us_per_km": 250.0},
    ],
    ids=["przekladnia_poza_znamionowa", "kabel_z_pojemnoscia"],
)
@pytest.mark.parametrize("punkt", PUNKTY)
def test_bilans_obejmuje_czlony_poprzeczne_galezi(
    wariant: dict[str, Any], rodzaj: str, punkt: str
) -> None:
    """Przekładnia poza-znamionowa i pojemność kabla: bilans domyka prąd członów poprzecznych.

    Człon poprzeczny to suma kolumnowa macierzy Y sieci zwarciowej minus admitancja źródeł —
    z TEJ macierzy, którą odwrócono. Przekładnia poza-znamionowa daje człon y·(1 − 1/a)² ≠ 0:
    bez niego suma wkładów źródeł NIE równa się I_k''(Th) — sprawdzone niżej, żeby test nie
    przechodził na członie zerowym. Admitancja poprzeczna kabla NIE wchodzi do sieci
    zwarciowej składowej zgodnej (IEC 60909-0:2016 p. 5.2, karta BEZ-POJEMNOSCI), więc przy
    przekładniach znamionowych człon jest zerowy, a suma wkładów źródeł sama równa się
    I_k''(Th)."""
    wynik = _licz(siec_h5(**wariant), rodzaj, punkt, 1.1)
    assert wynik.wklady_zrodel is not None
    bilans = _krok(wynik, "wklady_zrodel_bilans")["result"]
    suma = sum((fazor(w.i_a, w.kat_deg) for w in wynik.wklady_zrodel), 0j)
    prad_czlonow = bilans["prad_czlonow_poprzecznych_a"]
    tolerancja = tolerancja_bilansu_a(wynik.ik_thevenin_a)
    assert abs(suma + prad_czlonow - wynik.ik_thevenin_a) <= tolerancja
    assert bilans["bilans_domkniety"] is True
    if wariant.get("przekladnia_poza_znamionowa"):
        assert abs(prad_czlonow) > 100 * tolerancja
        assert abs(suma - wynik.ik_thevenin_a) > tolerancja
    else:
        assert abs(prad_czlonow) <= tolerancja
        assert abs(suma - wynik.ik_thevenin_a) <= tolerancja


#: Susceptancja kabla odejścia K1 (3 km) [µS/km]: brak, typowy kabel SN o dużym przekroju,
#: skrajnie duża (B·ℓ = 7,5 mS — rząd kilkudziesięciu km kabla SN w jednej gałęzi).
SUSCEPTANCJE_KABLA_US_PER_KM = (0.0, 250.0, 2500.0)


@pytest.mark.parametrize("rodzaj", RODZAJE)
@pytest.mark.parametrize("punkt", PUNKTY)
@pytest.mark.parametrize("przekladnia_poza_znamionowa", [False, True])
@pytest.mark.parametrize("maszyna", [False, True])
def test_bilans_wkladow_zrodel_kabel_o_duzym_b_bez_czlonow_poprzecznych(
    maszyna: bool, przekladnia_poza_znamionowa: bool, punkt: str, rodzaj: str
) -> None:
    """Partia integracji BEZ-POJEMNOSCI × WKLAD-ZRODLA: bilans wkładów źródeł w sieci
    zwarciowej bez admitancji poprzecznych gałęzi.

    Iloczyn cech: susceptancja kabla {0, 250, 2500 µS/km} × przekładnia {znamionowa,
    poza-znamionowa} × maszyna wirująca {brak, jest} × punkt {szyna SN, za kablem} × rodzaj
    zwarcia {3F, 1F, 2F, 2F+Z}. Asercje:

    * I_k''(Th), wpisy wkładów źródeł i prąd członów poprzecznych są BIT W BIT takie same dla
      każdego B — susceptancja kabla nie wchodzi do sieci zgodnej (IEC 60909-0:2016 p. 5.2);
    * przy przekładniach znamionowych Σ I_Q,k = I_k''(Th) w tolerancji kontraktu bilansu,
      a człon poprzeczny jest zerowy — także przy B·ℓ = 7,5 mS (B/2 przywrócone w sieci
      zgodnej dałoby tu prąd ładowania rzędu dziesiątek A, wielokrotność tolerancji);
    * przy przekładni poza-znamionowej człon poprzeczny jest niezerowy i niezależny od B.
    """
    wyniki = [
        _licz(
            siec_h5(
                lacznik_sn=True,
                lacznik_110kv=przekladnia_poza_znamionowa,
                maszyna=maszyna,
                przekladnia_poza_znamionowa=przekladnia_poza_znamionowa,
                b_kabla_us_per_km=b,
            ),
            rodzaj,
            punkt,
            1.1,
        )
        for b in SUSCEPTANCJE_KABLA_US_PER_KM
    ]
    odciski = []
    for wynik in wyniki:
        assert wynik.wklady_zrodel is not None
        bilans = _krok(wynik, "wklady_zrodel_bilans")["result"]
        odciski.append(
            (
                wynik.ik_thevenin_a,
                tuple((w.source_id, w.i_a, w.kat_deg) for w in wynik.wklady_zrodel),
                bilans["prad_czlonow_poprzecznych_a"],
            )
        )
        suma = sum((fazor(w.i_a, w.kat_deg) for w in wynik.wklady_zrodel), 0j)
        tolerancja = tolerancja_bilansu_a(wynik.ik_thevenin_a)
        assert bilans["bilans_domkniety"] is True
        if przekladnia_poza_znamionowa:
            assert abs(bilans["prad_czlonow_poprzecznych_a"]) > 100 * tolerancja
        else:
            assert abs(bilans["prad_czlonow_poprzecznych_a"]) <= tolerancja
            assert abs(suma - wynik.ik_thevenin_a) <= tolerancja, (suma, wynik.ik_thevenin_a)
    assert odciski[1] == odciski[0]
    assert odciski[2] == odciski[0]


def _siec_dwuwezlowa(z_q1: complex | None, z_q2: complex, z_l: complex) -> NetworkGraph:
    """Sieć A–B; ``z_q1=None`` — węzeł SLACK A bez zasilania systemowego (szyna sztywna)."""
    graf = NetworkGraph()
    graf.add_node(
        Node(
            id="A",
            name="Szyna A",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graf.add_node(
        Node(
            id="B",
            name="Szyna B",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graf.add_branch(
        LineBranch(
            id="L_AB",
            name="Linia A-B",
            branch_type=BranchType.LINE,
            from_node_id="A",
            to_node_id="B",
            r_ohm_per_km=z_l.real,
            x_ohm_per_km=z_l.imag,
            b_us_per_km=0.0,
            length_km=1.0,
            rated_current_a=400.0,
        )
    )
    if z_q1 is not None:
        graf.add_grid_sc_source(GridShortCircuitSource(id="Q1", name="Q1", node_id="A", z_ohm=z_q1))
    graf.add_grid_sc_source(GridShortCircuitSource(id="Q2", name="Q2", node_id="B", z_ohm=z_q2))
    return graf


Z_Q1 = complex(0.08, 0.80)
Z_Q2 = complex(0.25, 1.25)
Z_L = complex(0.40, 0.30)


@pytest.mark.parametrize("punkt", ["A", "B"])
def test_dzielnik_pradu_sieci_dwuwezlowej(punkt: str) -> None:
    """Rachunek niezależny: dzielnik prądu i ręczne odwrócenie macierzy Y 2×2 (w omach).

    Zwarcie w B: tor Q1 to Z_Q1 + Z_L, tor Q2 to Z_Q2 — prąd dzieli się odwrotnie do
    impedancji torów: I_Q1/I_k = Z_Q2/(Z_Q1 + Z_L + Z_Q2), I_Q2/I_k = (Z_Q1 + Z_L)/(…).
    Ta sama liczba z ręcznej macierzy: I_Q,k/I_k = (1/Z_Q,k)·Z_kf. Wkład liczony z Z_ff
    zamiast Z_kf daje dla Q1 (1/Z_Q1)·Z_BB ≠ dzielnik — wstrzyknięcie czerwieni ten test.
    """
    c, un_v = 1.1, 15_000.0
    tor_a = Z_Q1 if punkt == "A" else Z_Q1 + Z_L
    tor_b = Z_Q2 + Z_L if punkt == "A" else Z_Q2
    z_th = tor_a * tor_b / (tor_a + tor_b)
    ik = c * un_v / (math.sqrt(3.0) * abs(z_th))
    oczekiwane = {"Q1": tor_b / (tor_a + tor_b), "Q2": tor_a / (tor_a + tor_b)}

    # Ręczny Z-bus (omy, jeden poziom napięcia — baza znosi się w iloczynie Y·Z).
    y = np.array([[1 / Z_Q1 + 1 / Z_L, -1 / Z_L], [-1 / Z_L, 1 / Z_L + 1 / Z_Q2]], dtype=complex)
    det = y[0, 0] * y[1, 1] - y[0, 1] * y[1, 0]
    z_reczne = np.array([[y[1, 1], -y[0, 1]], [-y[1, 0], y[0, 0]]], dtype=complex) / det
    f = 0 if punkt == "A" else 1
    z_reczne_kf = {"Q1": z_reczne[0, f], "Q2": z_reczne[1, f]}
    y_q = {"Q1": 1 / Z_Q1, "Q2": 1 / Z_Q2}
    for zrodlo in ("Q1", "Q2"):
        assert y_q[zrodlo] * z_reczne_kf[zrodlo] == pytest.approx(oczekiwane[zrodlo], rel=1e-12)

    wynik = _licz(_siec_dwuwezlowa(Z_Q1, Z_Q2, Z_L), "3F", punkt, c)
    assert wynik.ikss_a == pytest.approx(ik, rel=1e-10)
    assert wynik.wklady_zrodel is not None
    wpisy = {w.source_id: w for w in wynik.wklady_zrodel}
    assert set(wpisy) == {"Q1", "Q2"}
    for zrodlo, wspolczynnik in oczekiwane.items():
        wpis = wpisy[zrodlo]
        assert wpis.rodzaj == RODZAJ_BOCZNIKA_SIEC
        assert wpis.klasa == KLASA_WKLADU_ZRODLA
        assert wpis.i_a == pytest.approx(abs(wspolczynnik) * ik, rel=1e-10)
        assert wpis.kat_deg == pytest.approx(math.degrees(cmath.phase(wspolczynnik)), abs=1e-9)
        assert wpis.i_zaciski_a == wpis.i_a  # jeden poziom napięcia
    assert sum((fazor(w.i_a, w.kat_deg) for w in wpisy.values()), 0j) == pytest.approx(
        complex(ik), abs=tolerancja_bilansu_a(ik)
    )


#: Admitancja odniesienia idealnego węzła SLACK bez zasilania systemowego w stemplu macierzy
#: (`AdmittanceMatrixBuilder._ground_slack_buses`, V12K-184) — wartość ODNIESIENIA testu,
#: rdzeń wkładów jej nie zna (czyta resztę przekątnej stempla).
Y_SZYNY_SZTYWNEJ_PU = complex(1e6, 0.0)


def _siec_szyny_sztywnej(*, maszyna_na_szynie: bool) -> NetworkGraph:
    """Sieć dwuwęzłowa: A — SLACK BEZ zasilania systemowego (szyna sztywna), B — zasilanie Q2;
    opcjonalnie generator synchroniczny na szynie sztywnej A (reszta przekątnej po maszynie)."""
    from network_model.core.machine import SynchronousMachineSource

    graf = _siec_dwuwezlowa(None, Z_Q2, Z_L)
    if maszyna_na_szynie:
        graf.add_synchronous_machine_source(
            SynchronousMachineSource(
                id="GS_A",
                name="Generator A",
                node_id="A",
                sr_mva=8.0,
                ur_kv=15.0,
                xd_subtransient_pu=0.14,
                cos_phi_r=0.85,
            )
        )
    return graf


@pytest.mark.parametrize("rodzaj", RODZAJE)
@pytest.mark.parametrize("punkt", ["A", "B"])
@pytest.mark.parametrize("maszyna_na_szynie", [False, True], ids=["bez_maszyny", "z_maszyna"])
def test_szyna_sztywna_bez_zasilania_systemowego(
    maszyna_na_szynie: bool, punkt: str, rodzaj: str
) -> None:
    """Węzeł SLACK bez Z_Q: wpis „szyna_sztywna" z admitancją odniesienia idealnego, wartość
    z reszty przekątnej stempla (także gdy na tej szynie stoi maszyna), bilans domknięty."""
    graf = _siec_szyny_sztywnej(maszyna_na_szynie=maszyna_na_szynie)
    wynik = _licz(graf, rodzaj, punkt, 1.1)
    assert wynik.wklady_zrodel is not None
    wpisy = {w.source_id: w for w in wynik.wklady_zrodel}
    assert set(wpisy) == ({"A", "Q2", "GS_A"} if maszyna_na_szynie else {"A", "Q2"})
    assert wpisy["A"].rodzaj == RODZAJ_BOCZNIKA_SZYNA_SZTYWNA
    y_sztywnej = _krok(wynik, "wklad_zrodla_A")["inputs"]["y_pu"]
    assert y_sztywnej == pytest.approx(Y_SZYNY_SZTYWNEJ_PU, rel=1e-12)
    bilans = _krok(wynik, "wklady_zrodel_bilans")["result"]
    assert bilans["bilans_domkniety"] is True
    assert abs(bilans["prad_czlonow_poprzecznych_a"]) <= tolerancja_bilansu_a(wynik.ik_thevenin_a)


#: Układy rozbicia admitancji źródeł: iloczyn H5 + szyna sztywna (z maszyną i bez).
UKLADY_ROZBICIA: dict[str, Any] = {
    **{nazwa: (lambda kw=kw: siec_h5(**kw)) for nazwa, kw in UKLADY.items()},
    "przekladnia_i_maszyna": lambda: siec_h5(
        lacznik_110kv=True, przekladnia_poza_znamionowa=True, maszyna=True
    ),
    "szyna_sztywna": lambda: _siec_szyny_sztywnej(maszyna_na_szynie=False),
    "szyna_sztywna_z_maszyna": lambda: _siec_szyny_sztywnej(maszyna_na_szynie=True),
}


@pytest.mark.parametrize("uklad", list(UKLADY_ROZBICIA))
def test_rozbicie_na_zrodla_rowne_stemplowi_macierzy(uklad: str) -> None:
    """Para predykatów: zbiór źródeł w macierzy Y i zbiór źródeł w wyniku mają jedno źródło.

    Suma admitancji `boczniki_zrodel` per węzeł = przekątna stempla źródeł budowniczego
    (`admitancje_zrodel_macierzy`), a admitancja źródła sieciowego i maszyny = Z_base/Z
    liczone w teście (rachunek niezależny). Źródło pominięte albo dopisane w rozbiciu
    czerwieni ten test niezależnie od kroku bilansu."""
    graf = UKLADY_ROZBICIA[uklad]()
    builder, _z_bus = build_zbus(graf)
    rozmiar = len(set(builder.node_id_to_index.values()))
    przekatna = admitancje_zrodel_macierzy(builder, rozmiar)
    boczniki = boczniki_zrodel(graf, builder, przekatna)
    suma = np.zeros(rozmiar, dtype=complex)
    for bocznik in boczniki:
        suma[bocznik.indeks] += bocznik.y_pu
        if bocznik.rodzaj == RODZAJ_BOCZNIKA_SIEC:
            zrodlo = graf.grid_sc_sources[bocznik.element_id]
            z_base = graf.nodes[bocznik.node_id].voltage_level ** 2 / 100.0
            assert bocznik.y_pu == pytest.approx(z_base / zrodlo.z_ohm, rel=1e-14)
    assert np.allclose(suma, przekatna, rtol=1e-12, atol=0.0), (suma, przekatna)
    assert np.count_nonzero(przekatna) == len({b.indeks for b in boczniki})


def _z_q2_dla_wkladu(cel_a: float) -> complex:
    """Z_Q2 dające (w przybliżeniu) wkład ``cel_a`` przy zwarciu w A — wartość dokładną
    liczy ``_wklad_q2_reczny`` dzielnikiem, klasyfikację porównuje się z NIM."""
    modul = 1.1 * 15_000.0 / (math.sqrt(3.0) * cel_a)
    return complex(0.0, modul)


def _wklad_q2_reczny(z_q2: complex) -> float:
    tor_a, tor_b = Z_Q1, z_q2 + Z_L
    z_th = tor_a * tor_b / (tor_a + tor_b)
    ik = 1.1 * 15_000.0 / (math.sqrt(3.0) * abs(z_th))
    return abs(tor_a / (tor_a + tor_b)) * ik


@pytest.mark.parametrize("cel_a", [2.0e-6, 1.2e-6, 5.0e-7, 1.0e-8])
def test_prog_wkladu_zrodla_jeden_predykat(cel_a: float) -> None:
    """Wkład źródła tuż nad i pod progiem 1e-6 A: klasyfikuje WYŁĄCZNIE `jest_wkladem_pominietym`.

    Drugi próg (np. „wkład < 1 mA pomijamy") przestawiłby wpisy 2e-6 i 1,2e-6 A na
    pominięte — wstrzyknięcie czerwieni ten test. Wartość odniesienia z dzielnika prądu.
    """
    z_q2 = _z_q2_dla_wkladu(cel_a)
    reczny = _wklad_q2_reczny(z_q2)
    wynik = _licz(_siec_dwuwezlowa(Z_Q1, z_q2, Z_L), "3F", "A", 1.1)
    assert wynik.wklady_zrodel is not None
    (q2,) = (w for w in wynik.wklady_zrodel if w.source_id == "Q2")
    surowy = _krok(wynik, "wklad_zrodla_Q2")["result"]["i_a"]
    assert surowy == pytest.approx(reczny, rel=1e-6)
    if jest_wkladem_pominietym(reczny):
        assert reczny < PROG_WKLADU_POMIJALNEGO_A
        assert q2.klasa == KLASA_WKLADU_ZRODLA_POMINIETY
        assert q2.przyczyna == NAZWA_WKLADU_POMINIETEGO
        assert q2.i_a == pytest.approx(reczny, rel=1e-2)
    else:
        assert q2.klasa == KLASA_WKLADU_ZRODLA
        assert q2.przyczyna is None
        assert q2.i_a == surowy
    # Wkład pominięty nadal wchodzi do bilansu (karta §0 pkt 4).
    assert _krok(wynik, "wklady_zrodel_bilans")["result"]["bilans_domkniety"] is True


@pytest.mark.parametrize("punkt", ["SN_A", "SN_B", "POLE", "WN_B"])
def test_wklad_maszyny_rowny_rozkladowi_wkladow_maszyn(punkt: str) -> None:
    """Para dwóch dróg tej samej fizyki: wkład maszyny w wyniku = `compute_machine_contributions`.

    `machine_sc_iec60909` liczy prąd częściowy maszyny c·Z_mk/(Z_kk·Z_m) (3F, metaliczne)
    dla prądu wyłączeniowego I_b — innym porządkiem działań zmiennoprzecinkowych, więc
    zgodność do 1e-12, nie bit w bit. Rozjazd = dwie prawdy o tym samym wkładzie."""
    graf = siec_h5(lacznik_sn=True, maszyna=True)
    wynik = _licz(graf, "3F", punkt, 1.1)
    assert wynik.wklady_zrodel is not None
    (gs,) = (w for w in wynik.wklady_zrodel if w.source_id == "GS_B")
    assert gs.rodzaj == RODZAJ_BOCZNIKA_MASZYNA_SYNCHRONICZNA
    maszyny = compute_machine_contributions(graf, punkt, c_factor=1.1, t_min_s=0.1)
    (czesciowy,) = maszyny.contributions
    assert gs.i_a == pytest.approx(czesciowy.ikss_partial_a, rel=1e-12)
    assert gs.i_zaciski_a == pytest.approx(czesciowy.ikss_zaciski_a, rel=1e-12)


def _skrot(wynik: ShortCircuitResult) -> str:
    return hashlib.sha256(
        json.dumps(wynik.to_dict(), sort_keys=True, default=repr).encode()
    ).hexdigest()


def test_determinizm_dwa_biegi_i_przebudowa_grafu_daja_ten_sam_skrot() -> None:
    skroty = set()
    for _ in range(2):
        graf = siec_h5(lacznik_sn=True, maszyna=True)
        for rodzaj in RODZAJE:
            for punkt in PUNKTY:
                skroty.add((rodzaj, punkt, _skrot(_licz(graf, rodzaj, punkt, 1.1))))
    assert len(skroty) == len(RODZAJE) * len(PUNKTY)


@pytest.mark.parametrize("rodzaj", RODZAJE)
@pytest.mark.parametrize("uklad", list(UKLADY))
def test_nowe_pola_addytywne_dotychczasowe_bez_zmian(uklad: str, rodzaj: str) -> None:
    """Bieg bez wkładów nie niesie nowych kluczy (exclude-None); z wkładami — pozostałe pola
    (w tym wkłady gałęziowe obliczone z tej samej macierzy) bajtowo te same co bez nich."""
    assert KLUCZE_NOWE <= set(OPTIONAL_SHORT_CIRCUIT_RESULT_KEYS)
    graf = siec_h5(**UKLADY[uklad])
    bez = _licz(graf, rodzaj, "POLE", 1.1, wklady=False).to_dict()
    z_wkladami = _licz(graf, rodzaj, "POLE", 1.1).to_dict()
    assert not KLUCZE_NOWE & set(bez)
    assert KLUCZE_NOWE <= set(z_wkladami)
    rozplyw = {"branch_contributions", "branch_flow_trace", "wklady_pominiete", *KLUCZE_NOWE}
    wspolne = {k: v for k, v in z_wkladami.items() if k not in rozplyw}
    assert json.dumps(wspolne, sort_keys=True, default=repr) == json.dumps(
        {k: v for k, v in bez.items() if k not in rozplyw}, sort_keys=True, default=repr
    )
