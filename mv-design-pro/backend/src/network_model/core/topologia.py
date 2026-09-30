"""Jądro algorytmów topologii sieci — JEDYNA implementacja (CV-4.3, konstytucja C.2.2).

Czyste funkcje nad parą (węzły, krawędzie) — bez zależności od ENM ani od IR, żeby
mogły je wołać OBIE warstwy: ``enm/topology.py::derive`` (migawka ENM, szyny po
``ref_id``) oraz ``network_model/core/graph.py``/``ybus.py`` (IR, węzły po ``id``).
Każda inna implementacja składowych spójnych, union-find, BFS/DFS po elementach
sieci poza tym modułem jest naruszeniem (guard ``topology_single_impl_guard``).

Determinizm: wynik zależy wyłącznie od kolejności ``wezly`` i treści ``krawedzie``;
sąsiedztwo jest przeglądane w porządku posortowanym; w wyniku nie ma ``set``.
Krawędź z końcem spoza ``wezly`` jest pomijana — tak samo jak w
``NetworkGraph._rebuild_graph`` (gałąź do nieistniejącego węzła nie łączy niczego)
i w walidatorze ENM.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Callable, Hashable, Iterable, Sequence
from typing import TypeVar

N = TypeVar("N", bound=Hashable)
E = TypeVar("E")


class UniaWezlow:
    """Union-find ze ścieżką połowioną; reprezentant klasy = jej najmniejszy element.

    Przeniesione 1:1 z ``network_model/core/ybus.py::_UnionFind`` (CV-4.3): reguła
    „mniejszy korzeń zostaje rodzicem" sprawia, że korzeń klasy jest zawsze jej
    leksykograficznie najmniejszym elementem NIEZALEŻNIE od kolejności łączeń —
    od tej reguły zależy porządek wierszy macierzy admitancyjnej, więc jest
    utrwalona testem.
    """

    def __init__(self, elementy: Iterable[str]) -> None:
        self._rodzic: dict[str, str] = {e: e for e in elementy}

    def __contains__(self, element: str) -> bool:
        return element in self._rodzic

    def znajdz(self, x: str) -> str:
        rodzic = self._rodzic
        while rodzic[x] != x:
            rodzic[x] = rodzic[rodzic[x]]
            x = rodzic[x]
        return x

    def polacz(self, a: str, b: str) -> None:
        ra, rb = self.znajdz(a), self.znajdz(b)
        if ra != rb:
            if ra > rb:
                ra, rb = rb, ra
            self._rodzic[rb] = ra


def scal_wezly(wezly: Iterable[str], pary: Iterable[tuple[str, str]]) -> dict[str, str]:
    """Mapa węzeł → reprezentant klasy po scaleniu ``pary`` (para z końcem spoza ``wezly`` pomijana).

    Zastosowanie: węzły łączności scalone przez ZAMKNIĘTE łączniki (CN → TN).
    """
    lista = list(wezly)
    unia = UniaWezlow(lista)
    for a, b in pary:
        if a in unia and b in unia:
            unia.polacz(a, b)
    return {w: unia.znajdz(w) for w in lista}


def skladowe_spojne(
    wezly: Iterable[str], krawedzie: Iterable[tuple[str, str]]
) -> tuple[tuple[str, ...], ...]:
    """Składowe spójne grafu nieskierowanego.

    Kolejność składowych = kolejność pierwszego napotkania węzła w ``wezly`` (ta sama,
    którą daje przegląd węzłów w porządku wstawiania); węzły składowej posortowane.
    """
    lista = list(wezly)
    sasiedzi: dict[str, set[str]] = {w: set() for w in lista}
    for a, b in krawedzie:
        if a in sasiedzi and b in sasiedzi and a != b:
            sasiedzi[a].add(b)
            sasiedzi[b].add(a)
    odwiedzone: set[str] = set()
    wynik: list[tuple[str, ...]] = []
    for start in lista:
        if start in odwiedzone:
            continue
        odwiedzone.add(start)
        kolejka: deque[str] = deque([start])
        skladowa = [start]
        while kolejka:
            biezacy = kolejka.popleft()
            for sasiad in sorted(sasiedzi[biezacy]):
                if sasiad not in odwiedzone:
                    odwiedzone.add(sasiad)
                    skladowa.append(sasiad)
                    kolejka.append(sasiad)
        wynik.append(tuple(sorted(skladowa)))
    return tuple(wynik)


def polaczone(wezly: Iterable[str], krawedzie: Iterable[tuple[str, str]], a: str, b: str) -> bool:
    """Czy ``a`` i ``b`` leżą w jednej składowej (``a == b`` → True, węzeł spoza ``wezly`` → False)."""
    unia = UniaWezlow(wezly)
    if a not in unia or b not in unia:
        return False
    for x, y in krawedzie:
        if x in unia and y in unia:
            unia.polacz(x, y)
    return unia.znajdz(a) == unia.znajdz(b)


def ma_cykl(wezly: Iterable[str], krawedzie: Iterable[tuple[str, str]]) -> bool:
    """Czy graf ma cykl. Krawędzie równoległe (ta sama para węzłów) liczone RAZ —
    linia + łącznik między tymi samymi szynami to standardowa topologia SN, nie cykl
    (zachowana semantyka ``enm/topology_ops._detect_cycles``); pętla własna = cykl."""
    unia = UniaWezlow(wezly)
    widziane: set[tuple[str, str]] = set()
    for a, b in krawedzie:
        if a not in unia or b not in unia:
            continue
        if a == b:
            return True
        para = (a, b) if a <= b else (b, a)
        if para in widziane:
            continue
        widziane.add(para)
        if unia.znajdz(a) == unia.znajdz(b):
            return True
        unia.polacz(a, b)
    return False


def przeglad_wszerz(
    start: N,
    sasiedzi: Callable[[N], Iterable[tuple[E, N]]],
    *,
    odwiedzone: set[N] | None = None,
) -> dict[N, tuple[E, N] | None]:
    """Drzewo przeglądu wszerz od ``start``: węzeł → (etykieta krawędzi, rodzic); korzeń → ``None``.

    ``sasiedzi(wezel)`` oddaje pary (etykieta, sąsiad) W KOLEJNOŚCI, w jakiej mają być
    odwiedzane — porządek (a więc wybór rodzica przy wielu drogach) należy do
    wołającego, mechanika przeglądu do jądra. Węzeł raz odwiedzony nie zmienia rodzica.
    Kolejność kluczy wyniku = kolejność odkrycia (poziomy rosnąco).

    ``odwiedzone`` — opcjonalny zbiór WSPÓLNY między wywołaniami (przegląd z wielu
    korzeni po kolei, jak identyfikacja toru głównego od kolejnych szyn zasilających):
    węzły już w nim obecne nie są wchodzone, odkryte są do niego dopisywane; ``start``
    już odwiedzony → puste drzewo.
    """
    return przeglad_wszerz_od([start], sasiedzi, odwiedzone=odwiedzone)


def przeglad_wszerz_od(
    starty: Sequence[N],
    sasiedzi: Callable[[N], Iterable[tuple[E, N]]],
    *,
    odwiedzone: set[N] | None = None,
) -> dict[N, tuple[E, N] | None]:
    """Przegląd wszerz z WIELU korzeni NARAZ (poziomowo: wszystkie korzenie na poziomie 0,
    w podanej kolejności) — głębokość węzła = odległość od NAJBLIŻSZEGO korzenia.
    To nie to samo, co kolejne wywołania ``przeglad_wszerz`` ze wspólnym ``odwiedzone``
    (wtedy pierwszy korzeń zagarnia wszystko, co osiągalne). Semantyka poza tym jak
    ``przeglad_wszerz``."""
    if odwiedzone is None:
        odwiedzone = set()
    rodzic: dict[N, tuple[E, N] | None] = {}
    kolejka: deque[N] = deque()
    for start in starty:
        if start in odwiedzone:
            continue
        odwiedzone.add(start)
        rodzic[start] = None
        kolejka.append(start)
    while kolejka:
        biezacy = kolejka.popleft()
        for etykieta, sasiad in sasiedzi(biezacy):
            if sasiad in odwiedzone:
                continue
            odwiedzone.add(sasiad)
            rodzic[sasiad] = (etykieta, biezacy)
            kolejka.append(sasiad)
    return rodzic


def poziomy(drzewo: dict[N, tuple[E, N] | None]) -> dict[N, int]:
    """Głębokość każdego węzła drzewa z ``przeglad_wszerz`` (korzeń = 0)."""
    wynik: dict[N, int] = {}
    for wezel, rodzic in drzewo.items():
        wynik[wezel] = 0 if rodzic is None else wynik[rodzic[1]] + 1
    return wynik


def sciezka_do(drzewo: dict[N, tuple[E, N] | None], cel: N) -> list[tuple[N, E, N]] | None:
    """Droga korzeń → ``cel`` jako lista (od, etykieta, do); ``None`` gdy cel nieosiągalny."""
    if cel not in drzewo:
        return None
    kroki: list[tuple[N, E, N]] = []
    biezacy = cel
    while True:
        rodzic = drzewo[biezacy]
        if rodzic is None:
            break
        etykieta, poprzedni = rodzic
        kroki.append((poprzedni, etykieta, biezacy))
        biezacy = poprzedni
    kroki.reverse()
    return kroki
