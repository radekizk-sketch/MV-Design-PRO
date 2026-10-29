"""Drogi proste jądra topologii i parytet toru z ``derive`` na całym rejestrze sieci (karta K6a).

1. ``drogi_proste`` vs wyrocznia ``networkx.all_simple_edge_paths`` na losowych multigrafach
   (krawędzie równoległe = pętla) × {cel pojedynczy, wiele celów}, granica liczby dróg
   i budżet kroków — obcięcie zawsze zgłoszone (``kompletne=False``).
2. ``podziel_krawedzie`` = zbiór krawędzi, z którego ``derive`` buduje wyspy (jedno źródło).
3. Parytet na CAŁYM rejestrze sieci wzorcowych: stan zasilenia szyny = ``Wyspa.zasilona``,
   zasilany ⇔ tor ma drogę pewną; czas największej sieci rejestru zmierzony.
"""

from __future__ import annotations

import random
import time

import networkx as nx
import pytest
from application.topologia_zasilenia import zbuduj_stan_zasilenia, zbuduj_tor_elementu
from enm.topology import derive, podziel_krawedzie
from network_model.core.topologia import drogi_proste, skladowe_spojne

from tests.golden.parytet_assemblera.harness import kopie_sieci_enm_rejestru


def _multigraf(los: random.Random, n: int, m: int) -> list[tuple[str, str, str]]:
    wezly = [f"n{i}" for i in range(n)]
    return [(f"k{j}", los.choice(wezly), los.choice(wezly)) for j in range(m)]


def _sasiedzi(krawedzie: list[tuple[str, str, str]]):
    mapa: dict[str, list[tuple[str, str]]] = {}
    for ref, a, b in krawedzie:
        if a == b:
            continue
        mapa.setdefault(a, []).append((ref, b))
        mapa.setdefault(b, []).append((ref, a))
    for lista in mapa.values():
        lista.sort()
    return lambda w: mapa.get(w, [])


def _wyrocznia(krawedzie: list[tuple[str, str, str]], start: str, cele: set[str]) -> set[tuple]:
    graf = nx.MultiGraph()
    graf.add_node(start)
    for ref, a, b in krawedzie:
        if a != b:
            graf.add_edge(a, b, key=ref)
    wynik: set[tuple] = set()
    for cel in cele:
        if cel not in graf or cel == start:
            continue
        for droga in nx.all_simple_edge_paths(graf, start, cel):
            wezly = [start] + [krok[1] for krok in droga]
            if any(w in cele for w in wezly[1:-1]):
                continue  # droga kończy się na PIERWSZYM celu
            wynik.add(tuple(krok[2] for krok in droga))
    return wynik


@pytest.mark.parametrize("ziarno", range(40))
@pytest.mark.parametrize("liczba_celow", [1, 2])
def test_drogi_proste_rowne_wyroczni_networkx(ziarno: int, liczba_celow: int) -> None:
    los = random.Random(ziarno)
    krawedzie = _multigraf(los, n=7, m=10)
    cele = {f"n{i}" for i in los.sample(range(1, 7), liczba_celow)}
    drogi, kompletne = drogi_proste(
        "n0", cele, _sasiedzi(krawedzie), limit=10_000, budzet_krokow=10_000_000
    )
    assert kompletne
    otrzymane = [tuple(k[1] for k in d) for d in drogi]
    assert len(otrzymane) == len(set(otrzymane)), "każda droga raz"
    assert set(otrzymane) == _wyrocznia(krawedzie, "n0", cele)
    for droga in drogi:
        assert droga[0][0] == "n0" and droga[-1][2] in cele
        assert all(droga[i][2] == droga[i + 1][0] for i in range(len(droga) - 1))


def test_drogi_proste_start_w_celu_krawedzie_rownolegle_i_obciecie() -> None:
    sasiedzi = _sasiedzi([("a", "s", "t"), ("b", "s", "t"), ("c", "s", "x"), ("d", "x", "t")])
    assert drogi_proste("s", {"s"}, sasiedzi, limit=5, budzet_krokow=100) == ([[]], True)
    drogi, kompletne = drogi_proste("s", {"t"}, sasiedzi, limit=5, budzet_krokow=100)
    assert kompletne and [[k[1] for k in d] for d in drogi] == [["a"], ["b"], ["c", "d"]]
    # Granica liczby dróg: dokładnie tyle dróg, ile wynosi limit → kompletne.
    assert drogi_proste("s", {"t"}, sasiedzi, limit=3, budzet_krokow=100)[1] is True
    obciete, kompletne = drogi_proste("s", {"t"}, sasiedzi, limit=2, budzet_krokow=100)
    assert not kompletne and [[k[1] for k in d] for d in obciete] == [["a"], ["b"]]
    assert drogi_proste("s", {"t"}, sasiedzi, limit=5, budzet_krokow=1)[1] is False
    assert drogi_proste("s", {"nieosiagalny"}, sasiedzi, limit=5, budzet_krokow=100) == (
        [],
        True,
    )


def test_drogi_proste_dlugi_ciag_bez_rekursji() -> None:
    n = 5_000
    sasiedzi = _sasiedzi([(f"k{i}", f"n{i}", f"n{i + 1}") for i in range(n)])
    drogi, kompletne = drogi_proste("n0", {f"n{n}"}, sasiedzi, limit=2, budzet_krokow=10 * n)
    assert kompletne and len(drogi) == 1 and len(drogi[0]) == n


@pytest.fixture(scope="module")
def sieci():
    return kopie_sieci_enm_rejestru()


def test_podzial_krawedzi_jest_zbiorem_krawedzi_wysp_derive(sieci) -> None:
    for nazwa, enm in sieci:
        podzial = podziel_krawedzie(enm)
        widok = derive(enm)
        krawedzie = [(k.szyna_a, k.szyna_b) for k in podzial.w_ruchu]
        oczekiwane = sorted(
            skladowe_spojne(podzial.szyny, krawedzie), key=lambda s: (-len(s), s[0])
        )
        assert [w.szyny for w in widok.wyspy] == oczekiwane, nazwa
        assert podzial.laczniki_otwarte == widok.laczniki_otwarte, nazwa
        assert podzial.krawedzie_pominiete == widok.krawedzie_pominiete, nazwa


def test_parytet_stanu_i_toru_na_calym_rejestrze(sieci) -> None:
    assert len(sieci) >= 40
    najdluzej = (0.0, "", 0)
    for nazwa, enm in sieci:
        widok = derive(enm)
        start = time.perf_counter()
        odpowiedz = zbuduj_stan_zasilenia("c", enm)
        czas = time.perf_counter() - start
        if czas > najdluzej[0]:
            najdluzej = (czas, nazwa, len(odpowiedz.elementy))
        stany = {e.ref_id: e for e in odpowiedz.elementy}
        for szyna in widok.szyny:
            wyspa = widok.wyspa_szyny(szyna)
            assert wyspa is not None
            assert (stany[szyna].stan == "zasilany") == wyspa.zasilona, (nazwa, szyna)
        # Predykaty parami na próbce szyn każdej sieci (pierwsza, środkowa, ostatnia).
        for szyna in {widok.szyny[0], widok.szyny[len(widok.szyny) // 2], widok.szyny[-1]}:
            tor = zbuduj_tor_elementu("c", enm, szyna)
            assert (tor.stan == "zasilany") == any(d.pewna for d in tor.drogi), (nazwa, szyna)
    # Budżet czasu: stan zasilenia największej sieci rejestru poniżej 2 s (pomiar w meldunku).
    assert najdluzej[0] < 2.0, najdluzej
