"""Tolerancja napięcia sieci nN — JEDEN predykat per węzeł (karta WSPOLCZYNNIK-C-JEDEN-NOSNIK).

Tabela 1 IEC 60909-0 rozróżnia sieci nN o tolerancji +6 % (c 1,05/0,95) i +10 %
(c 1,10/0,90). Tolerancja jest daną SIECI nN, a sieć nN w modelu to wyspa galwaniczna
szyn w paśmie nN (połączonych gałęziami, których oba końce leżą w paśmie nN — transformator
oddziela wyspę). Nośnikiem danej jest transformator zasilający wyspę
(``Transformer.lv_voltage_tolerance``, wzorzec ``lv_earthing_system``): to on definiuje
system nN, a K_T tego samego transformatora (IEC 60909-0 eq. 12a) czyta c_max strony dolnej z
tej samej deklaracji — wejście (c węzła nN) i wyjście (K_T) mają jedno źródło.

Wyspa ma tolerancję tylko wtedy, gdy KAŻDY jej transformator zasilający ją deklaruje i
wszystkie deklaracje są zgodne. Brak deklaracji, sprzeczne deklaracje albo wyspa bez
transformatora zasilającego (źródło przyłączone wprost do szyny nN) dają ``None`` z nazwanym
powodem — c węzła nN jest wtedy odmową ``fault.c_tolerancja_nn_brak``, nigdy wierszem +6 %
po cichu. Walidator, gotowość, mapper grafu i dowody czytają WYŁĄCZNIE tę funkcję.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from network_model.core.voltage_factor import TolerancjaNapieciaNn
from network_model.pochodne.pasma_napieciowe import w_pasmie_nn

from .models import EnergyNetworkModel

PowodBrakuTolerancji = Literal["BRAK_DEKLARACJI", "DEKLARACJE_SPRZECZNE", "BRAK_TRANSFORMATORA"]


@dataclass(frozen=True)
class WyspaNn:
    """Wyspa galwaniczna szyn nN z deklaracjami tolerancji jej transformatorów zasilających."""

    bus_refs: tuple[str, ...]
    transformator_refs: tuple[str, ...]
    #: Transformatory wyspy bez deklaracji (kolejność modelu).
    bez_deklaracji: tuple[str, ...]
    tolerancja: TolerancjaNapieciaNn | None
    powod: PowodBrakuTolerancji | None


def wyspy_nn(enm: EnergyNetworkModel) -> list[WyspaNn]:
    """Wyspy nN modelu w kolejności pierwszej szyny (deterministycznie)."""
    nn_refs = [b.ref_id for b in enm.buses if w_pasmie_nn(b.voltage_kv)]
    rodzic: dict[str, str] = {ref: ref for ref in nn_refs}

    def znajdz(ref: str) -> str:
        while rodzic[ref] != ref:
            rodzic[ref] = rodzic[rodzic[ref]]
            ref = rodzic[ref]
        return ref

    for galaz in enm.branches:
        a, b = galaz.from_bus_ref, galaz.to_bus_ref
        if a in rodzic and b in rodzic:
            ra, rb = znajdz(a), znajdz(b)
            if ra != rb:
                rodzic[max(ra, rb)] = min(ra, rb)

    grupy: dict[str, list[str]] = {}
    for ref in nn_refs:
        grupy.setdefault(znajdz(ref), []).append(ref)

    wynik: list[WyspaNn] = []
    for szyny in grupy.values():
        zbior = set(szyny)
        trafo = [t for t in enm.transformers if t.lv_bus_ref in zbior and w_pasmie_nn(t.ulv_kv)]
        deklaracje = {t.lv_voltage_tolerance for t in trafo if t.lv_voltage_tolerance is not None}
        bez = tuple(t.ref_id for t in trafo if t.lv_voltage_tolerance is None)
        tolerancja: TolerancjaNapieciaNn | None = None
        powod: PowodBrakuTolerancji | None = None
        if not trafo:
            powod = "BRAK_TRANSFORMATORA"
        elif bez:
            powod = "BRAK_DEKLARACJI"
        elif len(deklaracje) > 1:
            powod = "DEKLARACJE_SPRZECZNE"
        else:
            tolerancja = next(iter(deklaracje))
        wynik.append(
            WyspaNn(
                bus_refs=tuple(szyny),
                transformator_refs=tuple(t.ref_id for t in trafo),
                bez_deklaracji=bez,
                tolerancja=tolerancja,
                powod=powod,
            )
        )
    return wynik


def tolerancje_wezlow_nn(enm: EnergyNetworkModel) -> dict[str, TolerancjaNapieciaNn | None]:
    """Tolerancja sieci nN per szyna nN (``ref_id``); szyny spoza pasma nN nie występują."""
    return {ref: wyspa.tolerancja for wyspa in wyspy_nn(enm) for ref in wyspa.bus_refs}
