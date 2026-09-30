"""Testy jedynego serwisu topologii (CV-4.3, konstytucja C.2.2).

Dwie warstwy dowodu:
1. iloczyn cech na małych modelach — {łącznik zamknięty, łącznik otwarty, bezpiecznik,
   linia otwarta, transformator, gałąź do nieistniejącej szyny, szyna izolowana,
   kolejność wejścia} × {wyspy, węzły topologiczne, sekcje, źródła odniesienia};
2. parytet na CAŁYM rejestrze sieci wzorcowych z TRZEMA niezależnymi wyroczniami
   zastanymi w repo: `NetworkGraph.find_islands` (IR, networkx), scalanie CN → TN
   `AdmittanceMatrixBuilder._build_merged_node_map` (IR, union-find w macierzy Y)
   i `ENMValidator` E003 (ENM, networkx) oraz z `networkx` bezpośrednio.
"""

from __future__ import annotations

import random

import networkx as nx
import pytest
from enm.mapping import _ref_to_uuid, map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from enm.topology import (
    TYPY_LACZNIKOW_ENM,
    TYPY_MASZYN_ASYNCHRONICZNYCH,
    TYPY_MASZYN_SYNCHRONICZNYCH,
    TopologyView,
    derive,
)
from enm.validator import ENMValidator
from network_model.core.topologia import (
    UniaWezlow,
    ma_cykl,
    polaczone,
    poziomy,
    przeglad_wszerz,
    przeglad_wszerz_od,
    scal_wezly,
    sciezka_do,
    skladowe_spojne,
)
from network_model.core.ybus import AdmittanceMatrixBuilder

from tests.golden.parytet_assemblera.harness import sieci_enm_rejestru

# --------------------------------------------------------------------------- jądro


def test_jadro_skladowe_spojne_pomija_krawedz_do_nieznanego_wezla_i_sortuje() -> None:
    skladowe = skladowe_spojne(["C", "A", "B", "D"], [("A", "B"), ("B", "X"), ("D", "D")])
    # kolejność = pierwsze napotkanie w liście węzłów; węzły składowej posortowane
    assert skladowe == (("C",), ("A", "B"), ("D",))


def test_jadro_unia_reprezentant_to_najmniejszy_element_niezaleznie_od_kolejnosci() -> None:
    for kolejnosc in ([("c", "b"), ("b", "a")], [("b", "a"), ("c", "b")], [("a", "c"), ("c", "b")]):
        assert scal_wezly(["c", "b", "a", "z"], kolejnosc) == {
            "a": "a",
            "b": "a",
            "c": "a",
            "z": "z",
        }
    unia = UniaWezlow(["b", "a"])
    unia.polacz("b", "a")
    assert unia.znajdz("b") == "a"
    assert "a" in unia and "q" not in unia


def test_jadro_polaczone_i_ma_cykl() -> None:
    wezly = ["A", "B", "C"]
    assert polaczone(wezly, [("A", "B")], "A", "B")
    assert not polaczone(wezly, [("A", "B")], "A", "C")
    assert not polaczone(wezly, [("A", "B")], "A", "Q")
    assert polaczone(wezly, [], "A", "A")
    assert not ma_cykl(wezly, [("A", "B"), ("B", "C")])
    assert not ma_cykl(wezly, [("A", "B"), ("A", "B")])  # gałęzie równoległe = nie cykl
    assert ma_cykl(wezly, [("A", "B"), ("B", "C"), ("C", "A")])
    assert ma_cykl(wezly, [("A", "A")])


def test_jadro_przeglad_wszerz_rodzic_wg_kolejnosci_wolajacego() -> None:
    krawedzie = {"R": [("b2", "B"), ("b1", "A")], "A": [("c", "C")], "B": [("d", "C")], "C": []}
    drzewo = przeglad_wszerz("R", lambda w: krawedzie.get(w, []))
    # A i B odwiedzone z R w kolejności podanej przez wołającego (B przed A);
    # C dostaje rodzica z PIERWSZEJ drogi (przez B), późniejsza droga go nie zmienia
    assert drzewo == {"R": None, "B": ("b2", "R"), "A": ("b1", "R"), "C": ("d", "B")}
    assert list(drzewo) == ["R", "B", "A", "C"]


def test_jadro_przeglad_z_wielu_korzeni_naraz_vs_po_kolei() -> None:
    """Poziomowo z wielu korzeni: głębokość = odległość od NAJBLIŻSZEGO korzenia;
    po kolei ze wspólnym `odwiedzone`: pierwszy korzeń zagarnia wszystko osiągalne.
    Różnica ujawniła się na fiksturach scenariuszy nN (ekspansja domeny z wielu
    nasion) — dlatego obie semantyki są nazwane i przypięte."""
    krawedzie = {"A": [("ab", "B")], "B": [("bc", "C")], "C": [("cd", "D")], "D": []}
    sasiedzi = lambda w: krawedzie.get(w, [])  # noqa: E731
    naraz = przeglad_wszerz_od(["A", "D"], sasiedzi)
    assert poziomy(naraz) == {"A": 0, "D": 0, "B": 1, "C": 2}
    odwiedzone: set[str] = set()
    po_kolei = dict(przeglad_wszerz("A", sasiedzi, odwiedzone=odwiedzone))
    po_kolei.update(przeglad_wszerz("D", sasiedzi, odwiedzone=odwiedzone))
    assert poziomy(po_kolei) == {"A": 0, "B": 1, "C": 2, "D": 3}
    assert przeglad_wszerz("D", sasiedzi, odwiedzone={"D"}) == {}
    assert sciezka_do(naraz, "C") == [("A", "ab", "B"), ("B", "bc", "C")]
    assert sciezka_do(naraz, "A") == [] and sciezka_do(naraz, "Q") is None


# --------------------------------------------------------------------------- derive


def _model() -> dict:
    """B1 —linia— B2 =łącznik= B3 —linia otwarta— B4 —trafo— B5; B6 izolowana;
    linia B5–BX do nieistniejącej szyny; źródło na B1, maszyna synchroniczna na B5,
    falownik na B6."""
    szyny = [{"ref_id": f"B{i}", "name": f"B{i}", "voltage_kv": 15.0} for i in range(1, 7)]
    galezie = [
        {
            "ref_id": "L12",
            "type": "line_overhead",
            "from_bus_ref": "B1",
            "to_bus_ref": "B2",
            "status": "closed",
        },
        {
            "ref_id": "S23",
            "type": "breaker",
            "from_bus_ref": "B2",
            "to_bus_ref": "B3",
            "status": "closed",
        },
        {
            "ref_id": "L34",
            "type": "cable",
            "from_bus_ref": "B3",
            "to_bus_ref": "B4",
            "status": "open",
        },
        {
            "ref_id": "L5X",
            "type": "cable",
            "from_bus_ref": "B5",
            "to_bus_ref": "BX",
            "status": "closed",
        },
        {
            "ref_id": "S16",
            "type": "disconnector",
            "from_bus_ref": "B1",
            "to_bus_ref": "B6",
            "status": "open",
        },
    ]
    return {
        "buses": szyny,
        "branches": galezie,
        "transformers": [{"ref_id": "T45", "hv_bus_ref": "B4", "lv_bus_ref": "B5"}],
        "sources": [{"ref_id": "SRC", "bus_ref": "B1"}, {"ref_id": "SRC_X", "bus_ref": "BX"}],
        "generators": [
            {"ref_id": "G5", "bus_ref": "B5", "gen_type": "synchronous"},
            {"ref_id": "G6", "bus_ref": "B6", "gen_type": "pv_inverter"},
        ],
    }


def test_derive_wyspy_wezly_topologiczne_sekcje_i_zrodla() -> None:
    widok = derive(_model())
    assert widok.szyny == ("B1", "B2", "B3", "B4", "B5", "B6")
    assert [w.szyny for w in widok.wyspy] == [("B1", "B2", "B3"), ("B4", "B5"), ("B6",)]
    assert widok.wezel_topologiczny == {
        "B1": "B1",
        "B2": "B2",
        "B3": "B2",
        "B4": "B4",
        "B5": "B5",
        "B6": "B6",
    }
    assert widok.wezly_topologiczne == ("B1", "B2", "B4", "B5", "B6")
    # sekcje: transformator NIE łączy (domeny napięciowe)
    assert widok.sekcje == (("B1", "B2", "B3"), ("B4",), ("B5",), ("B6",))
    assert widok.laczniki_otwarte == ("S16",)
    assert widok.galezie_otwarte == ("L34",)
    assert widok.krawedzie_pominiete == ("L5X",)
    zasilana, maszynowa, falownikowa = widok.wyspy
    assert zasilana.zrodla_sieciowe == ("SRC",) and zasilana.zasilona and zasilana.ma_odniesienie
    assert maszynowa.maszyny == ("G5",) and not maszynowa.zasilona and maszynowa.ma_odniesienie
    assert falownikowa.generatory == ("G6",) and falownikowa.maszyny == ()
    assert not falownikowa.ma_odniesienie
    assert widok.szyny_bez_odniesienia() == frozenset({"B6"})
    assert widok.szyny_niezasilone() == frozenset({"B4", "B5", "B6"})
    assert widok.wyspa_szyny("B3") is zasilana and widok.wyspa_szyny("BX") is None


@pytest.mark.parametrize("typ", sorted(TYPY_LACZNIKOW_ENM))
def test_derive_kazdy_typ_lacznika_zamkniety_scala_a_otwarty_dzieli(typ: str) -> None:
    def model(status: str) -> dict:
        return {
            "buses": [{"ref_id": "A"}, {"ref_id": "B"}],
            "branches": [
                {
                    "ref_id": "S",
                    "type": typ,
                    "from_bus_ref": "A",
                    "to_bus_ref": "B",
                    "status": status,
                }
            ],
        }

    zamkniety = derive(model("closed"))
    assert zamkniety.wezel_topologiczny == {"A": "A", "B": "A"}
    assert [w.szyny for w in zamkniety.wyspy] == [("A", "B")]
    otwarty = derive(model("open"))
    assert otwarty.wezel_topologiczny == {"A": "A", "B": "B"}
    assert [w.szyny for w in otwarty.wyspy] == [("A",), ("B",)]
    assert otwarty.laczniki_otwarte == ("S",)


def test_derive_linia_zamknieta_laczy_wyspe_ale_nie_scala_wezlow() -> None:
    widok = derive(
        {
            "buses": [{"ref_id": "A"}, {"ref_id": "B"}],
            "branches": [
                {
                    "ref_id": "L",
                    "type": "cable",
                    "from_bus_ref": "A",
                    "to_bus_ref": "B",
                    "status": "closed",
                }
            ],
        }
    )
    assert [w.szyny for w in widok.wyspy] == [("A", "B")]
    assert widok.wezel_topologiczny == {"A": "A", "B": "B"}


def test_derive_nie_zalezy_od_kolejnosci_elementow_i_akceptuje_model_pydantic() -> None:
    bazowy = _model()
    widok = derive(bazowy)
    for ziarno in range(5):
        los = random.Random(ziarno)
        pomieszany = {
            "buses": los.sample(bazowy["buses"], len(bazowy["buses"])),
            "branches": los.sample(bazowy["branches"], len(bazowy["branches"])),
            "transformers": list(bazowy["transformers"]),
            "sources": los.sample(bazowy["sources"], len(bazowy["sources"])),
            "generators": los.sample(bazowy["generators"], len(bazowy["generators"])),
        }
        assert derive(pomieszany) == widok
    # pusta migawka = pusty widok, nie wyjątek
    pusty = derive({})
    assert pusty.szyny == () and pusty.wyspy == () and pusty.sekcje == ()


def test_typy_maszyn_sa_jednym_zrodlem_prawdy_z_mapowaniem_enm_ir() -> None:
    from enm import mapping

    assert set(mapping._ASYNC_GEN_TYPES) == set(TYPY_MASZYN_ASYNCHRONICZNYCH)
    assert TYPY_MASZYN_SYNCHRONICZNYCH == frozenset({"synchronous"})
    assert not (
        set(mapping.FULL_CONVERTER_SC_GEN_TYPES)
        & (TYPY_MASZYN_SYNCHRONICZNYCH | TYPY_MASZYN_ASYNCHRONICZNYCH)
    )


# --------------------------------------------------------------------------- parytet z wyroczniami


def _sieci() -> list[tuple[str, EnergyNetworkModel]]:
    return sieci_enm_rejestru()


@pytest.fixture(scope="module")
def widoki() -> list[tuple[str, EnergyNetworkModel, TopologyView]]:
    return [(nazwa, enm, derive(enm)) for nazwa, enm in _sieci()]


def _graf_ir(enm: EnergyNetworkModel, widok: TopologyView, nazwa: str):
    """IR z migawki — od CV-4.3 K3b (A3-05) dla KAŻDEJ sieci rejestru: IR przyjmuje
    po jednym węźle SLACK na źródło sieciowe (do K3b `NetworkGraph.add_node`
    odmawiał drugiego SLACK i 4 sieci rejestru z dwoma GPZ nie miały IR wcale).
    Szyny SLACK grafu == szyny źródeł sieciowych z ``TopologyView`` (parytet)."""
    graph = map_enm_to_network_graph(enm)
    zrodla_szyn = {
        _ref_to_uuid(zrodlo.bus_ref) for zrodlo in enm.sources if zrodlo.bus_ref in widok.szyny
    }
    assert set(graph.get_slack_node_ids()) == zrodla_szyn, nazwa
    return graph


def test_parytet_wysp_z_networkgraph_ir_dla_calego_rejestru(widoki) -> None:
    assert len(widoki) >= 40
    # Pomiar A3-05 (2026-09-05): 4 sieci rejestru z dwoma GPZ (G04/04, G05/04 — osobne
    # wyspy; G04/05, G05/05 — jedna wyspa) — po K3b IR istnieje dla wszystkich, odmowa
    # dwóch źródeł w jednej wyspie należy do assemblera rozpływu, nie do IR.
    z_wieloma_zrodlami = 0
    for nazwa, enm, widok in widoki:
        graph = _graf_ir(enm, widok, nazwa)
        if sum(len(w.zrodla_sieciowe) for w in widok.wyspy) >= 2:
            z_wieloma_zrodlami += 1
        oczekiwane = {frozenset(w) for w in graph.find_islands()}
        otrzymane = {frozenset(_ref_to_uuid(s) for s in w.szyny) for w in widok.wyspy}
        assert otrzymane == oczekiwane, nazwa
    assert z_wieloma_zrodlami >= 4


def test_parytet_wezlow_topologicznych_ze_scalaniem_macierzy_y(widoki) -> None:
    for nazwa, enm, widok in widoki:
        graph = _graf_ir(enm, widok, nazwa)
        _reprezentanci, wezel_do_indeksu = AdmittanceMatrixBuilder(graph)._build_merged_node_map()
        klasy_ir: dict[int, set[str]] = {}
        for wezel, indeks in wezel_do_indeksu.items():
            klasy_ir.setdefault(indeks, set()).add(wezel)
        klasy_tv: dict[str, set[str]] = {}
        for szyna, reprezentant in widok.wezel_topologiczny.items():
            klasy_tv.setdefault(reprezentant, set()).add(_ref_to_uuid(szyna))
        assert {frozenset(k) for k in klasy_ir.values()} == {
            frozenset(k) for k in klasy_tv.values()
        }, nazwa


def test_parytet_e003_walidatora_z_wyspami_niezasilonymi(widoki) -> None:
    walidator = ENMValidator()
    for nazwa, enm, widok in widoki:
        problemy: list = []
        walidator._check_graph_connectivity(enm, problemy)
        z_walidatora = {tuple(p.element_refs) for p in problemy if p.code == "E003"}
        z_widoku = (
            {w.szyny[:10] for w in widok.wyspy if not w.zasilona} if len(widok.wyspy) > 1 else set()
        )
        assert z_walidatora == z_widoku, nazwa


def test_parytet_sekcji_i_wysp_z_networkx_bezposrednio(widoki) -> None:
    for nazwa, enm, widok in widoki:
        znane = {b.ref_id for b in enm.buses}
        g_wyspy, g_sekcje = nx.Graph(), nx.Graph()
        for g in (g_wyspy, g_sekcje):
            g.add_nodes_from(sorted(znane))
        for galaz in enm.branches:
            if (
                galaz.status == "closed"
                and galaz.from_bus_ref in znane
                and galaz.to_bus_ref in znane
            ):
                g_wyspy.add_edge(galaz.from_bus_ref, galaz.to_bus_ref)
                g_sekcje.add_edge(galaz.from_bus_ref, galaz.to_bus_ref)
        for trafo in enm.transformers:
            if trafo.hv_bus_ref in znane and trafo.lv_bus_ref in znane:
                g_wyspy.add_edge(trafo.hv_bus_ref, trafo.lv_bus_ref)
        assert {frozenset(w.szyny) for w in widok.wyspy} == {
            frozenset(c) for c in nx.connected_components(g_wyspy)
        }, nazwa
        assert {frozenset(s) for s in widok.sekcje} == {
            frozenset(c) for c in nx.connected_components(g_sekcje)
        }, nazwa


def test_kazda_siec_rejestru_ma_wyspe_z_odniesieniem_i_wykaz_pominietych_jest_pusty(widoki) -> None:
    """Pomiar rejestru (nie wymóg fizyczny): każda sieć wzorcowa ma co najmniej jedną
    wyspę z impedancją do odniesienia i żadna gałąź nie wisi na nieistniejącej szynie —
    jeśli to się zmieni, ma być decyzją, nie przypadkiem."""
    for nazwa, _enm, widok in widoki:
        assert any(w.ma_odniesienie for w in widok.wyspy), nazwa
        assert widok.krawedzie_pominiete == (), (nazwa, widok.krawedzie_pominiete)
