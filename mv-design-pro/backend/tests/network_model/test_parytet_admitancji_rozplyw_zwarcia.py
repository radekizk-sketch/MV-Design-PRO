"""Parytet macierzy admitancyjnej Y(h=1): rozpływ (`build_ybus_pu`) ↔ zwarcia (`AdmittanceMatrixBuilder`).

Po co. W repozytorium są DWA niezależne budownicze macierzy admitancyjnej składowej zgodnej:

* `network_model/solvers/power_flow_newton_internal.py::build_ybus_pu` — rozpływ NR/GS/FD,
  estymacja WLS i adapter dynamiki; składa admitancje w siemensach (`_build_ybus_ohm`), każdą
  gałąź odnosi do bazy impedancyjnej WŁASNEJ szyny (`_base_scale`, Z_base = U²/S) i mnoży całość
  przez Z_base szyny odniesienia;
* `network_model/core/ybus.py::AdmittanceMatrixBuilder` — zwarcia IEC 60909; liczy wprost w
  jednostkach względnych na bazie S_BASE_MVA i napięciu znamionowym węzła.

Rozjazd tych dwóch był dotąd niewykrywalny: żaden test nie używał obu naraz. Migracja na
wspólny moduł stemplowania gałęzi to pozycja (a) bramki B-01 (plan A/B §12.2) — do tego czasu
parytet jest TESTEM, nie refaktorem (ten plik). Żaden rdzeń nie jest tu zmieniany.

RÓŻNICE REPREZENTACJI — NAZWANE, NIE UKRYTE. Porównanie przechodzi przez jawnie opisane
przekształcenia; każde z nich ma własny test pokazujący, że różnica istnieje:

R1 — łącznik zamknięty. Zwarcia SCALAJĄ węzły zamkniętego łącznika dokładnie (zerowa
     impedancja, `UniaWezlow`); rozpływ modeluje go impedancją 1e-4 + j1e-4 Ω
     (`_build_ybus_ohm`, `Y_CLOSED_SWITCH`). Porównujemy Y rozpływu PO SCALENIU węzłów
     (Pᵀ·Y·P, P — macierz przynależności węzła do reprezentanta): stempel łącznika znosi się
     w sumie wiersza i kolumny. Rozstrzygnięcie reprezentacji należy do osobnej decyzji.
R2 — gałąź równoległa do zamkniętego łącznika (oba końce w jednym węźle scalonym). Zwarcia
     pomijają ją W CAŁOŚCI (`from_idx == to_idx: continue`), także jej susceptancję B/2;
     rozpływ po scaleniu zachowuje 2·(B/2) tej gałęzi na przekątnej reprezentanta. Test
     dolicza ten człon jawnie (`_bocznik_galezi_wewnetrznych`) — różnica jest faktem modelu,
     sieć G13 rejestru ją zawiera (linia równoległa do zamkniętego łącznika SN).
R3 — przesunięcie fazowe grupy połączeń. Rozpływ modeluje je przekładnią zespoloną
     t = |t|·e^{−jθ} (Dyn11 → +30°); zwarcia symetryczne IEC 60909 składowej zgodnej — nie.
     Porównujemy D*·Y·D, gdzie D = diag(e^{jφ_i}), φ_i — skumulowane przesunięcie od korzenia
     wyspy (`_seed_phase_shift_angles`, ta sama definicja co start rozpływu); to zmiana
     cechowania, nie przybliżenie.
R4 — korekta K_T (IEC 60909-0 §6.3.3). Zwarcia stosują Z_TK = K_T·Z_T do transformatorów
     sieciowych, rozpływ — Z_T. Tryb „K_T wyłączona": zwarcia z Z_T (podstawienie metody
     korekty jej postacią bez korekty) = rozpływ BEZ zmian. Tryb „K_T włączona": rozpływ z
     jawnie wstawionym Z_TK = K_T·Z_T = zwarcia bez zmian. Oba tryby muszą dać parytet.
R5 — uziemienie węzłów zasilających i maszyn. Wyłącznie kontekst zwarciowy
     (`build(ground_slack_buses=True)`); do parytetu `ground_slack_buses=False`, rozpływ bez
     boczników nakładki (`shunts=[]`).

TOLERANCJA Z ROZDZIELCZOŚCI FLOAT, NIE ZASZYTA. Element Y powstaje z sumy m stempli
(m ≤ 1 + stopień węzła, z łącznikami i gałęziami scalonymi), a każdy stempel z łańcucha
co najwyżej c działań zmiennoprzecinkowych (zliczone w obu budowniczych: dla transformatora
uk/100, pk/S, pierwiastek, K_T — 3 działania, zmiana bazy 4, odwrotność, przekładnia
poza-znamionowa 4, dzielenie przez a i a², obrót fazy 2 — razem 20). Błąd bezwzględny
ograniczamy więc przez (m + c)·ε·max|Y|, gdzie ε = np.finfo(float).eps, a max|Y| — największy
moduł elementu obu macierzy (w tym stempla łącznika rozpływu, którego znoszenie się po scaleniu
jest źródłem największego błędu zaokrąglenia).

ILOCZYN CECH: przekładnia transformatora {znamionowa, zaczep ≠ 0, szyny poza tabliczką} ×
grupa połączeń {Yy0, Dyn11} × susceptancja linii {B = 0, B > 0} × gałąź wyłączona {nie, tak}
× łącznik zamknięty {brak, łącznik, łącznik z gałęzią równoległą} × K_T {wyłączona, włączona}.

MUTACJE (dowód, że test gryzie): odwrócony znak B/2, pominięta K_T i odwrócona przekładnia
w budowniczym zwarć — każda czerwieni parytet (testy `test_mutacja_*`).
"""

from __future__ import annotations

import functools
import itertools
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Any

import numpy as np
import pytest
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.core.switch import Switch, SwitchState, SwitchType
from network_model.core.ybus import S_BASE_MVA, AdmittanceMatrixBuilder
from network_model.solvers.power_flow_newton_internal import (
    _seed_phase_shift_angles,
    build_ybus_pu,
)

from tests.cgmes.golden_enm import build_golden_enm
from tests.golden.parytet_scenariuszy import harness as parytet_scenariuszy
from tests.golden.registry import REJESTR, StatusSieci, zbuduj_wszystkie

#: Najdłuższy łańcuch działań zmiennoprzecinkowych jednego stempla (zliczony w docstringu).
DZIALANIA_NA_STEMPEL = 20

KT_WYLACZONA = "K_T wyłączona"
KT_WLACZONA = "K_T włączona"


# ---------------------------------------------------------------------------
# Porównanie
# ---------------------------------------------------------------------------


def _graf(siec: Any) -> NetworkGraph:
    if isinstance(siec, NetworkGraph):
        return siec
    if isinstance(siec, dict):
        siec = EnergyNetworkModel.model_validate(siec)
    return map_enm_to_network_graph(siec)


def _katy_cechowania(graf: NetworkGraph, wezly: list[str]) -> dict[str, float]:
    """φ_i per wyspa (R3): korzeń = węzeł SLACK wyspy, a bez niego najmniejszy identyfikator."""
    katy: dict[str, float] = {}
    for wyspa in graf.find_islands():
        wyspa_posortowana = sorted(wyspa)
        korzen = next(
            (w for w in wyspa_posortowana if graf.nodes[w].node_type == NodeType.SLACK),
            wyspa_posortowana[0],
        )
        katy.update(_seed_phase_shift_angles(graf, wyspa_posortowana, korzen))
    for wezel in wezly:
        katy.setdefault(wezel, 0.0)
    return katy


def _bocznik_galezi_wewnetrznych(
    graf: NetworkGraph, wezel_na_indeks: dict[str, int], rozmiar: int
) -> np.ndarray:
    """R2: 2·(B/2) gałęzi, której oba końce leżą w jednym węźle scalonym (rozpływ ją zachowuje).

    Wartość wzięta z tego samego stempla, który budowniczy rozpływu wstawia na przekątną:
    susceptancja na koniec w siemensach × baza impedancyjna szyny `to` (Z_base = U²/S_BASE).
    """
    dodatek = np.zeros((rozmiar, rozmiar), dtype=complex)
    for galaz in graf.branches.values():
        if not galaz.in_service or not isinstance(galaz, LineBranch):
            continue
        i = wezel_na_indeks[galaz.from_node_id]
        if i != wezel_na_indeks[galaz.to_node_id]:
            continue
        u_kv = graf.nodes[galaz.to_node_id].voltage_level
        dodatek[i, i] += 2.0 * galaz.get_shunt_admittance_per_end() * (u_kv * u_kv / S_BASE_MVA)
    return dodatek


def rozbieznosc(graf: NetworkGraph) -> tuple[float, float]:
    """(max |Y_rozpływ po R1–R3 − Y_zwarcia|, tolerancja z rozdzielczości float)."""
    wezly = sorted(graf.nodes)
    slack = next((w for w in wezly if graf.nodes[w].node_type == NodeType.SLACK), wezly[0])

    budowniczy = AdmittanceMatrixBuilder(graf)
    y_zwarcia = budowniczy.build(ground_slack_buses=False)
    wezel_na_indeks = budowniczy.node_id_to_index

    # Domena = wszystkie węzły grafu (nie tylko wyspa slacka): zwarcia budują macierz dla
    # całego grafu, więc parytet obejmuje także wyspy bez zasilania.
    y_rozplywu, indeks_rozplywu, *_ = build_ybus_pu(graf, wezly, S_BASE_MVA, slack, [], {})

    katy = _katy_cechowania(graf, wezly)
    d = np.diag([np.exp(1j * katy[w]) for w in wezly])
    y_bez_przesuniecia = d.conj().T @ y_rozplywu @ d  # R3

    p = np.zeros((len(wezly), y_zwarcia.shape[0]))
    for wezel, i in indeks_rozplywu.items():
        p[i, wezel_na_indeks[wezel]] = 1.0
    y_scalona = p.T @ y_bez_przesuniecia @ p  # R1
    y_scalona -= _bocznik_galezi_wewnetrznych(graf, wezel_na_indeks, y_zwarcia.shape[0])  # R2

    if y_zwarcia.size == 0:
        return 0.0, 0.0
    # m — liczba stempli sumowanych w jednym elemencie macierzy scalonej: suma stopni
    # węzłów składowych reprezentanta (gałęzie i łączniki) plus jeden.
    stempli_na_reprezentanta = np.ones(y_zwarcia.shape[0], dtype=int)
    for element in (*graf.branches.values(), *graf.switches.values()):
        for wezel in (element.from_node_id, element.to_node_id):
            stempli_na_reprezentanta[wezel_na_indeks[wezel]] += 1
    stempli = int(stempli_na_reprezentanta.max())
    skala = max(float(np.max(np.abs(y_rozplywu))), float(np.max(np.abs(y_zwarcia))))
    tolerancja = (stempli + DZIALANIA_NA_STEMPEL) * float(np.finfo(float).eps) * skala
    return float(np.max(np.abs(y_scalona - y_zwarcia))), tolerancja


@contextmanager
def tryb_kt(tryb: str) -> Iterator[None]:
    """R4: K_T wyłączona — zwarcia z Z_T; K_T włączona — rozpływ z jawnym Z_TK = K_T·Z_T."""
    mp = pytest.MonkeyPatch()
    try:
        if tryb == KT_WYLACZONA:
            mp.setattr(
                TransformerBranch,
                "get_short_circuit_impedance_pu_corrected",
                TransformerBranch.get_short_circuit_impedance_pu,
            )
        else:
            z_bez_korekty = TransformerBranch.get_short_circuit_impedance_ohm_lv

            def z_z_korekta(self: TransformerBranch) -> complex:
                return self.get_kt_correction_factor() * z_bez_korekty(self)

            mp.setattr(TransformerBranch, "get_short_circuit_impedance_ohm_lv", z_z_korekta)
        yield
    finally:
        mp.undo()


def assert_parytet(graf: NetworkGraph, opis: str) -> None:
    for tryb in (KT_WYLACZONA, KT_WLACZONA):
        with tryb_kt(tryb):
            roznica, tolerancja = rozbieznosc(graf)
        assert roznica <= tolerancja, (
            f"{opis} [{tryb}]: max|ΔY| = {roznica:.3e} pu > tolerancja {tolerancja:.3e} pu — "
            "budownicze admitancji rozpływu i zwarć rozjechały się."
        )


# ---------------------------------------------------------------------------
# Sieci golden: rejestr sieci wzorcowych i parytet scenariuszy
# ---------------------------------------------------------------------------


@functools.cache
def _sieci_wpisu(id_: str) -> tuple[Any, ...]:
    """Sieci wpisu rejestru zbudowane raz na bieg (budowniczy nie mutują wyniku)."""
    return tuple(zbuduj_wszystkie(id_))


def _sieci_rejestru() -> list[tuple[str, Callable[[], NetworkGraph]]]:
    wynik: list[tuple[str, Callable[[], NetworkGraph]]] = []
    for wpis in REJESTR:
        if wpis.status == StatusSieci.NOT_BUILT:
            continue
        for k in range(len(_sieci_wpisu(wpis.id))):
            wynik.append(
                (f"{wpis.id}[{k}]", lambda id_=wpis.id, k_=k: _graf(_sieci_wpisu(id_)[k_]))
            )
    return wynik


_SIECI_PARYTETU_SCENARIUSZY: list[tuple[str, Callable[[], NetworkGraph]]] = [
    ("golden", lambda: _graf(build_golden_enm())),
    ("pierscien", lambda: _graf(parytet_scenariuszy._pierscien())),
    ("napiecie_graniczne", lambda: _graf(parytet_scenariuszy._napiecie_graniczne())),
    (
        "kompensacja_dzien",
        lambda: _graf(parytet_scenariuszy._kompensacja(load_q_mvar=2.0, gen_p_mw=None)),
    ),
    (
        "kompensacja_noc",
        lambda: _graf(parytet_scenariuszy._kompensacja(load_q_mvar=2.0, gen_p_mw=4.0)),
    ),
    ("promieniowa", lambda: _graf(parytet_scenariuszy._siec_promieniowa())),
    ("rozgalezienie", lambda: _graf(parytet_scenariuszy._siec_rozgalezienie())),
]

_SIECI_GOLDEN = _sieci_rejestru() + _SIECI_PARYTETU_SCENARIUSZY


def test_zbior_sieci_golden_nie_jest_pusty() -> None:
    """Rejestr bez zbudowanych sieci dałby zieleń bez treści."""
    assert len(_sieci_rejestru()) >= 40
    assert len(_SIECI_PARYTETU_SCENARIUSZY) == 7


@pytest.mark.parametrize(("opis", "budowniczy"), _SIECI_GOLDEN, ids=[s[0] for s in _SIECI_GOLDEN])
def test_parytet_y_sieci_golden(opis: str, budowniczy: Callable[[], NetworkGraph]) -> None:
    assert_parytet(budowniczy(), opis)


def test_sieci_golden_pokrywaja_cechy_parytetu() -> None:
    """Zbiór golden faktycznie ćwiczy cechy: przekładnię ≠ 1, grupę z przesunięciem, B/2,
    łącznik zamknięty, gałąź wyłączoną i gałąź równoległą do łącznika (R2)."""
    cechy: set[str] = set()
    for _, budowniczy in _SIECI_GOLDEN:
        graf = budowniczy()
        scalenie = AdmittanceMatrixBuilder(graf)
        scalenie.build(ground_slack_buses=False)
        indeks = scalenie.node_id_to_index
        for galaz in graf.branches.values():
            if not galaz.in_service:
                cechy.add("gałąź wyłączona")
            if isinstance(galaz, LineBranch) and galaz.get_shunt_admittance() != 0:
                cechy.add("B/2")
            if indeks[galaz.from_node_id] == indeks[galaz.to_node_id]:
                cechy.add("gałąź równoległa do łącznika")
            if isinstance(galaz, TransformerBranch):
                if _seed_phase_shift_angles(
                    graf, [galaz.from_node_id, galaz.to_node_id], galaz.from_node_id
                )[galaz.to_node_id]:
                    cechy.add("przesunięcie fazowe")
        if any(s.in_service and s.state == SwitchState.CLOSED for s in graf.switches.values()):
            cechy.add("łącznik zamknięty")
    assert cechy >= {
        "B/2",
        "łącznik zamknięty",
        "przesunięcie fazowe",
        "gałąź równoległa do łącznika",
    }, cechy


# ---------------------------------------------------------------------------
# Iloczyn cech na sieci syntetycznej
# ---------------------------------------------------------------------------

PRZEKLADNIE = ("znamionowa", "zaczep", "szyny_poza_tabliczka")
GRUPY = ("Yy0", "Dyn11")
SUSCEPTANCJE = (0.0, 250.0)  # µS/km
WYLACZENIA = (False, True)
LACZNIKI = ("brak", "lacznik", "lacznik_z_galezia_rownolegla")


def siec_cech(
    przekladnia: str, grupa: str, b_us_per_km: float, wylaczona: bool, lacznik: str
) -> NetworkGraph:
    """GPZ 110 kV → TR 110/15 kV → szyna SN A → linia → B → linia → C (+ łącznik / gałąź)."""
    u_sn = 15.75 if przekladnia == "szyny_poza_tabliczka" else 15.0
    graf = NetworkGraph()
    for id_, u_kv, typ in (
        ("GPZ", 110.0, NodeType.SLACK),
        ("SN_A", u_sn, NodeType.PQ),
        ("SN_B", u_sn, NodeType.PQ),
        ("SN_C", u_sn, NodeType.PQ),
        ("SN_D", u_sn, NodeType.PQ),
    ):
        graf.add_node(
            Node(
                id=id_,
                name=id_,
                node_type=typ,
                voltage_level=u_kv,
                active_power=0.0,
                reactive_power=0.0,
                **(
                    {"voltage_magnitude": 1.0, "voltage_angle": 0.0}
                    if typ == NodeType.SLACK
                    else {}
                ),
            )
        )
    graf.add_branch(
        TransformerBranch(
            id="TR",
            name="TR",
            branch_type=BranchType.TRANSFORMER,
            from_node_id="GPZ",
            to_node_id="SN_A",
            rated_power_mva=25.0,
            voltage_hv_kv=110.0,
            voltage_lv_kv=15.0,
            uk_percent=11.0,
            pk_kw=110.0,
            i0_percent=0.0,
            p0_kw=0.0,
            vector_group=grupa,
            tap_position=2 if przekladnia == "zaczep" else 0,
            tap_step_percent=2.5,
        )
    )

    def linia(id_: str, od: str, do: str, *, w_ruchu: bool = True) -> LineBranch:
        return LineBranch(
            id=id_,
            name=id_,
            branch_type=BranchType.CABLE,
            from_node_id=od,
            to_node_id=do,
            r_ohm_per_km=0.206,
            x_ohm_per_km=0.1,
            b_us_per_km=b_us_per_km,
            length_km=2.5,
            rated_current_a=300.0,
            in_service=w_ruchu,
        )

    graf.add_branch(linia("L_AB", "SN_A", "SN_B"))
    graf.add_branch(linia("L_BC", "SN_B", "SN_C"))
    graf.add_branch(linia("L_AC", "SN_A", "SN_C", w_ruchu=not wylaczona))
    if lacznik != "brak":
        graf.add_switch(
            Switch(
                id="Q_CD",
                name="Q_CD",
                from_node_id="SN_C",
                to_node_id="SN_D",
                switch_type=SwitchType.BREAKER,
                state=SwitchState.CLOSED,
            )
        )
    else:
        graf.add_branch(linia("L_CD", "SN_C", "SN_D"))
    if lacznik == "lacznik_z_galezia_rownolegla":
        graf.add_branch(linia("L_CD_rownolegla", "SN_C", "SN_D"))
    return graf


ILOCZYN = list(itertools.product(PRZEKLADNIE, GRUPY, SUSCEPTANCJE, WYLACZENIA, LACZNIKI))


@pytest.mark.parametrize("cechy", ILOCZYN, ids=["-".join(map(str, c)) for c in ILOCZYN])
def test_parytet_y_iloczyn_cech(cechy: tuple[str, str, float, bool, str]) -> None:
    assert_parytet(siec_cech(*cechy), f"iloczyn cech {cechy}")


# ---------------------------------------------------------------------------
# Różnice reprezentacji istnieją (bez przekształceń R1–R4 parytet byłby czerwony)
# ---------------------------------------------------------------------------


def test_r1_lacznik_zamkniety_rozplyw_ma_impedancje_zwarcia_scalaja() -> None:
    graf = siec_cech("znamionowa", "Yy0", 0.0, False, "lacznik")
    y_rozplywu, *_ = build_ybus_pu(graf, sorted(graf.nodes), S_BASE_MVA, "GPZ", [], {})
    budowniczy = AdmittanceMatrixBuilder(graf)
    y_zwarcia = budowniczy.build(ground_slack_buses=False)
    assert y_rozplywu.shape[0] == y_zwarcia.shape[0] + 1
    assert budowniczy.node_id_to_index["SN_C"] == budowniczy.node_id_to_index["SN_D"]
    # Stempel łącznika rozpływu: 1/(1e-4 + j1e-4) Ω na bazie 15 kV / 100 MVA.
    assert abs(y_rozplywu.max()) > 1e4


def test_r2_galaz_rownolegla_do_lacznika_zwarcia_pomijaja_b() -> None:
    graf = siec_cech("znamionowa", "Yy0", 250.0, False, "lacznik_z_galezia_rownolegla")
    budowniczy = AdmittanceMatrixBuilder(graf)
    budowniczy.build(ground_slack_buses=False)
    dodatek = _bocznik_galezi_wewnetrznych(
        graf, budowniczy.node_id_to_index, len(set(budowniczy.node_id_to_index.values()))
    )
    assert np.max(np.abs(dodatek)) > 0.0


def test_r3_przesuniecie_fazowe_rozplyw_ma_zwarcia_nie() -> None:
    graf = siec_cech("znamionowa", "Dyn11", 0.0, False, "brak")
    y_rozplywu, indeks, *_ = build_ybus_pu(graf, sorted(graf.nodes), S_BASE_MVA, "GPZ", [], {})
    y_zwarcia = AdmittanceMatrixBuilder(graf).build(ground_slack_buses=False)
    i, j = indeks["GPZ"], indeks["SN_A"]
    assert abs(np.angle(y_rozplywu[i, j]) - np.angle(y_zwarcia[i, j])) > 0.5


def test_r4_kt_rozni_macierze_poza_trybem() -> None:
    """Bez podstawienia trybu K_T macierze się RÓŻNIĄ — korekta jest wyłącznie zwarciowa."""
    roznica, tolerancja = rozbieznosc(siec_cech("znamionowa", "Yy0", 0.0, False, "brak"))
    assert roznica > 1e3 * tolerancja


# ---------------------------------------------------------------------------
# Mutacje: każda czerwieni parytet
# ---------------------------------------------------------------------------


def _mutuj_zwarcia(
    monkeypatch: pytest.MonkeyPatch,
    mutacja: Callable[[complex, complex, float], tuple[complex, complex, float]],
) -> None:
    oryginal = AdmittanceMatrixBuilder._get_branch_admittances_pu

    def zmutowany(self: AdmittanceMatrixBuilder, galaz: Any) -> tuple[complex, complex, float]:
        return mutacja(*oryginal(self, galaz))

    monkeypatch.setattr(AdmittanceMatrixBuilder, "_get_branch_admittances_pu", zmutowany)


def _czerwony(graf: NetworkGraph, tryb: str) -> bool:
    with tryb_kt(tryb):
        roznica, tolerancja = rozbieznosc(graf)
    return roznica > tolerancja


def test_mutacja_znak_b_polowa(monkeypatch: pytest.MonkeyPatch) -> None:
    _mutuj_zwarcia(monkeypatch, lambda y, b, a: (y, -b, a))
    assert _czerwony(siec_cech("znamionowa", "Yy0", 250.0, False, "brak"), KT_WYLACZONA)


def test_mutacja_odwrocona_przekladnia(monkeypatch: pytest.MonkeyPatch) -> None:
    _mutuj_zwarcia(monkeypatch, lambda y, b, a: (y, b, 1.0 / a))
    for przekladnia in ("zaczep", "szyny_poza_tabliczka"):
        assert _czerwony(siec_cech(przekladnia, "Yy0", 0.0, False, "brak"), KT_WYLACZONA)


def test_mutacja_pominieta_kt(monkeypatch: pytest.MonkeyPatch) -> None:
    """Zwarcia bez K_T, rozpływ z jawnym Z_TK — tryb „K_T włączona" musi to wykryć."""
    graf = siec_cech("znamionowa", "Yy0", 0.0, False, "brak")
    assert not _czerwony(graf, KT_WLACZONA)
    monkeypatch.setattr(
        TransformerBranch,
        "get_short_circuit_impedance_pu_corrected",
        TransformerBranch.get_short_circuit_impedance_pu,
    )
    with tryb_kt(KT_WLACZONA):
        # `tryb_kt` nie zmienia zwarć w trybie „włączona", więc mutacja zostaje w mocy.
        roznica, tolerancja = rozbieznosc(graf)
    assert roznica > tolerancja
