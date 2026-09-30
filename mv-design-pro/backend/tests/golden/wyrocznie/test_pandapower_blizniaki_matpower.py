"""Wyrocznia pandapower dla bliźniaków MATPOWER (IEEE case9/case14/case39) — rozpływ mocy.

Bliźniak ENM zbudowany operacjami domenowymi + katalogiem `benchmark` liczony torem
kanonicznym (`enm/assembler.py` → FROZEN NR) musi oddać rozwiązanie literatury:
pandapower `pn.caseXX()` + `runpp` (domyślnie bez egzekwowania granic Q — w tych sieciach
Q zbieżne każdego generatora mieści się w granicach z literatury, więc rozwiązanie jest to
samo). Do 2026-09-09 case14 ROZBIEGAŁ (linie 0,208 kV stemplowane bazą 135 kV), a case14 i
case39 liczyły się ze slackiem 1,0 zamiast 1,06/0,982 p.u. (`Source.u_set_pu` nie istniało);
case39 miał ponadto dwa transformatory z zaczepem na odwrotnym uzwojeniu (odchyłka 0,05 p.u.).
Tolerancja 2·10⁻⁴ p.u. = zaokrąglenia konwersji jednostek (Ω/km z 10 cyfr, µS) — nie luz
fizyczny; pomiar 2026-09-09: case9 4·10⁻⁵, case14 3·10⁻⁵, case39 < 1·10⁻⁵.
"""

from __future__ import annotations

import pytest
from enm.assembler import _graph_id_from_ref
from enm.canonical_analysis import _execute_power_flow
from enm.models import EnergyNetworkModel

from tests.golden.parytet_assemblera.harness import _bieg

# Marker `pandapower`: biegnie wyłącznie w izolowanym jobie CI (pandapower 3.5.4). pandapower
# importowany WEWNĄTRZ testu (jak most `tests/golden/wyrocznie/pandapower.py`), nie
# `importorskip` na poziomie modułu — moduł zbiera się bez pandapower, a zwykły bieg
# `-m "not pandapower"` DESELEKTUJE testy zamiast je pomijać (SKIP-INWENTARZ: zero skipów).
pytestmark = pytest.mark.pandapower

TOL_PU = 2e-4
_PRZYPADKI = [
    ("case9", "tests.golden.enm_builders.ieee_9bus", "build_ieee_9bus_enm"),
    ("case14", "tests.golden.enm_builders.ieee_14bus", "build_ieee_14bus_enm"),
    ("case39", "tests.golden.enm_builders.ieee_39bus", "build_ieee_39bus_enm"),
]


def _napiecia_blizniaka(modul: str, funkcja: str) -> tuple[list[float], int, int]:
    import importlib

    b = getattr(importlib.import_module(modul), funkcja)()
    enm = EnergyNetworkModel.model_validate(b.enm)
    run = _bieg(enm, klucz=f"wyrocznia-{funkcja}", analysis_type="PF", options={})
    _execute_power_flow(run)
    raw = run.raw_result or {}
    wynik = raw.get("result_v1") or {}
    assert wynik.get("converged") is True
    nodes = raw["graph"]["nodes"]
    nv = raw["node_voltage_kv"]
    napiecia: list[float] = []
    for i in range(len(b.bus_map)):
        nid = _graph_id_from_ref(b.bus_map[f"B{i}"])
        assert nv.get(nid) is not None, f"B{i}: brak napięcia"
        napiecia.append(nv[nid] / nodes[nid]["voltage_level"])
    return napiecia, int(wynik["iterations_count"]), len(raw.get("pv_to_pq_switches") or [])


@pytest.mark.parametrize("nazwa,modul,funkcja", _PRZYPADKI, ids=[p[0] for p in _PRZYPADKI])
def test_blizniak_matpower_oddaje_rozwiazanie_pandapower(
    nazwa: str, modul: str, funkcja: str
) -> None:
    import pandapower as pp  # type: ignore[import-not-found]
    import pandapower.networks as pn  # type: ignore[import-not-found]

    net = getattr(pn, nazwa)()
    pp.runpp(net)
    assert net.converged
    oczekiwane = [float(v) for v in net.res_bus.vm_pu]
    napiecia, iteracje, przelaczenia = _napiecia_blizniaka(modul, funkcja)
    assert len(napiecia) == len(oczekiwane)
    assert przelaczenia == 0, "granice Q bliźniaka nie mogą wiązać (nieograniczające z konstrukcji)"
    assert iteracje <= 10
    rozbieznosci = [
        (f"B{i}", round(a, 5), round(e, 5))
        for i, (a, e) in enumerate(zip(napiecia, oczekiwane, strict=True))
        if abs(a - e) > TOL_PU
    ]
    assert not rozbieznosci, rozbieznosci
