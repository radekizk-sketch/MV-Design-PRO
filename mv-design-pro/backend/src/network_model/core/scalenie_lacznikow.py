"""Scalenie węzłów połączonych ZAMKNIĘTYMI łącznikami — JEDEN predykat dla wszystkich analiz.

Łącznik (wyłącznik, rozłącznik, odłącznik, bezpiecznik) nie ma impedancji: zamknięty
łączy dwa węzły galwanicznie, więc tworzą one jeden węzeł elektryczny o jednym napięciu.
Tak modelują go dojrzałe narzędzia (PowerFactory — łącznik bez impedancji; pandapower —
łączniki szyna–szyna scalane w jedną szynę obliczeniową) i tak modeluje go rdzeń zwarć
IEC 60909 (`core/ybus.py`). Rozpływ mocy (NR/GS/FD), estymacja stanu i dynamika czasowa
korzystają z TEGO SAMEGO podziału — żadna analiza nie stempluje łącznika impedancją
zastępczą (dawne 0,0001 + j0,0001 Ω rozpływu i adaptera dynamiki usunięte).

Predykat przewodzenia (`lacznik_przewodzi`) jest jedynym źródłem odpowiedzi „czy ten
łącznik scala węzły": łącznik w ruchu (`in_service`) i zamknięty. Graf sieci
(`NetworkGraph._is_switch_active`), budowniczy macierzy zwarciowej i rozpływu wołają tę
samą funkcję.

Reprezentant grupy: najmniejszy identyfikator węzła grupy (`topologia.UniaWezlow`) —
niezależny od kolejności łączników, więc ta sama sieć daje te same indeksy i te same
identyfikatory w każdym biegu (determinizm).
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from .topologia import UniaWezlow


def lacznik_przewodzi(switch: object) -> bool:
    """Czy łącznik scala swoje węzły: w ruchu (`in_service`, brak pola = w ruchu) i zamknięty."""
    return bool(getattr(switch, "in_service", True)) and bool(getattr(switch, "is_closed", False))


@dataclass(frozen=True)
class GrupaScalenia:
    """Węzły scalone zamkniętymi łącznikami w jeden węzeł elektryczny.

    `czlonkowie` — posortowane identyfikatory węzłów grupy (z reprezentantem);
    `laczniki` — posortowane identyfikatory łączników zamkniętych wewnątrz grupy.
    """

    reprezentant: str
    czlonkowie: tuple[str, ...]
    laczniki: tuple[str, ...]


@dataclass(frozen=True)
class ScalenieLacznikow:
    """Podział węzłów na węzły elektryczne.

    `reprezentant` — węzeł → reprezentant jego grupy (węzeł bez zamkniętego łącznika jest
    własnym reprezentantem); `grupy` — wyłącznie grupy wielowęzłowe, posortowane po
    reprezentancie.
    """

    reprezentant: dict[str, str]
    grupy: tuple[GrupaScalenia, ...]

    @property
    def trywialne(self) -> bool:
        """Brak zamkniętego łącznika między węzłami zbioru — każdy węzeł jest sobą."""
        return not self.grupy


def scal_laczniki(graph: object, wezly: Iterable[str] | None = None) -> ScalenieLacznikow:
    """Scalenie węzłów zbioru `wezly` (domyślnie wszystkich węzłów grafu) zamkniętymi łącznikami.

    Łącznik wchodzi do scalenia, gdy `lacznik_przewodzi` i OBA jego końce należą do zbioru
    (łącznik do węzła spoza zbioru niczego w nim nie łączy — tak samo jak w
    `NetworkGraph.podgraf`). Wynik zależy wyłącznie od zbioru węzłów i zbioru łączników.
    """
    nodes = graph.nodes  # type: ignore[attr-defined]
    switches = graph.switches  # type: ignore[attr-defined]
    lista = sorted(nodes.keys() if wezly is None else wezly)
    unia = UniaWezlow(lista)
    przewodzace: list[tuple[str, str, str]] = []
    for switch_id in sorted(switches):
        switch = switches[switch_id]
        if not lacznik_przewodzi(switch):
            continue
        if switch.from_node_id not in unia or switch.to_node_id not in unia:
            continue
        unia.polacz(switch.from_node_id, switch.to_node_id)
        przewodzace.append((switch_id, switch.from_node_id, switch.to_node_id))

    reprezentant = {wezel: unia.znajdz(wezel) for wezel in lista}
    czlonkowie: dict[str, list[str]] = {}
    for wezel in lista:
        czlonkowie.setdefault(reprezentant[wezel], []).append(wezel)
    laczniki: dict[str, list[str]] = {}
    for switch_id, od, _do in przewodzace:
        laczniki.setdefault(reprezentant[od], []).append(switch_id)
    grupy = tuple(
        GrupaScalenia(
            reprezentant=rep,
            czlonkowie=tuple(czlonkowie[rep]),
            laczniki=tuple(sorted(laczniki[rep])),
        )
        for rep in sorted(czlonkowie)
        if len(czlonkowie[rep]) > 1
    )
    return ScalenieLacznikow(reprezentant=reprezentant, grupy=grupy)


__all__ = ["GrupaScalenia", "ScalenieLacznikow", "lacznik_przewodzi", "scal_laczniki"]
