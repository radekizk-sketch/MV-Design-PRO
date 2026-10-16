"""Tolerancja napięcia sieci nN — JEDEN predykat per węzeł (karta WSPOLCZYNNIK-C-JEDEN-NOSNIK).

Tabela 1 IEC 60909-0 rozróżnia sieci nN o tolerancji +6 % (c 1,05/0,95) i +10 %
(c 1,10/0,90). Tolerancja jest daną SIECI nN, a sieć nN w modelu to wyspa galwaniczna
szyn w paśmie nN (połączonych gałęziami, których oba końce leżą w paśmie nN — transformator
oddziela wyspę). Nośnikiem danej jest element ZASILAJĄCY wyspę — ten, który definiuje napięcie
sieci nN:

- transformator, którego strona dolna (pasmo nN) leży na szynie wyspy
  (``Transformer.lv_voltage_tolerance``, wzorzec ``lv_earthing_system``); K_T tego samego
  transformatora (IEC 60909-0 eq. 12a) czyta c_max strony dolnej z tej samej deklaracji —
  wejście (c węzła nN) i wyjście (K_T) mają jedno źródło;
- źródło sieciowe (równoważnik sieci zasilającej) przyłączone wprost do szyny wyspy
  (``Source.lv_voltage_tolerance``) — sieć nN zasilana bez transformatora w modelu; Z_Q tego
  źródła (eq. 6) czyta c z tej samej deklaracji przez węzeł przyłączenia.

Wyspa ma tolerancję tylko wtedy, gdy KAŻDY jej element zasilający ją deklaruje i wszystkie
deklaracje są zgodne. Brak deklaracji, sprzeczne deklaracje albo wyspa bez elementu
zasilającego dają ``None`` z nazwanym powodem — c węzła nN jest wtedy odmową
``fault.c_tolerancja_nn_brak``, nigdy wierszem +6 % po cichu. Bramka gotowości, mapper grafu,
pętla zwarcia i dowody czytają WYŁĄCZNIE tę funkcję.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from network_model.core.node import Node
from network_model.core.voltage_factor import (
    DoborC,
    NadpisanieC,
    OdmowaToleranciiNnError,
    Scenario,
    TolerancjaNapieciaNn,
    dobierz_c,
)
from network_model.nazwy import nazwa_nadana
from network_model.pochodne.pasma_napieciowe import w_pasmie_nn

from .models import EnergyNetworkModel
from .nazwy_elementow import NAZWA_ELEMENTU_BEZ_NAZWY

PowodBrakuTolerancji = Literal["BRAK_DEKLARACJI", "DEKLARACJE_SPRZECZNE", "BRAK_ZASILAJACEGO"]
#: Rodzaj elementu zasilającego wyspę nN — klucz kolekcji ENM, w której leży nośnik.
RodzajZasilajacego = Literal["transformers", "sources"]


@dataclass(frozen=True)
class ZasilajacyNn:
    """Element zasilający wyspę nN i jego deklaracja tolerancji (``None`` = brak deklaracji)."""

    rodzaj: RodzajZasilajacego
    ref_id: str
    tolerancja: TolerancjaNapieciaNn | None


@dataclass(frozen=True)
class WyspaNn:
    """Wyspa galwaniczna szyn nN z deklaracjami tolerancji jej elementów zasilających."""

    bus_refs: tuple[str, ...]
    #: Elementy zasilające: transformatory (kolejność modelu), potem źródła (kolejność modelu).
    zasilajacy: tuple[ZasilajacyNn, ...]
    tolerancja: TolerancjaNapieciaNn | None
    powod: PowodBrakuTolerancji | None

    @property
    def bez_deklaracji(self) -> tuple[ZasilajacyNn, ...]:
        """Elementy zasilające wyspę bez deklaracji tolerancji (kolejność ``zasilajacy``)."""
        return tuple(z for z in self.zasilajacy if z.tolerancja is None)


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
        zasilajacy = tuple(
            ZasilajacyNn("transformers", t.ref_id, t.lv_voltage_tolerance)
            for t in enm.transformers
            if t.lv_bus_ref in zbior and w_pasmie_nn(t.ulv_kv)
        ) + tuple(
            ZasilajacyNn("sources", s.ref_id, s.lv_voltage_tolerance)
            for s in enm.sources
            if s.bus_ref in zbior
        )
        deklaracje = {z.tolerancja for z in zasilajacy if z.tolerancja is not None}
        tolerancja: TolerancjaNapieciaNn | None = None
        powod: PowodBrakuTolerancji | None = None
        if not zasilajacy:
            powod = "BRAK_ZASILAJACEGO"
        elif any(z.tolerancja is None for z in zasilajacy):
            powod = "BRAK_DEKLARACJI"
        elif len(deklaracje) > 1:
            powod = "DEKLARACJE_SPRZECZNE"
        else:
            tolerancja = next(iter(deklaracje))
        wynik.append(
            WyspaNn(
                bus_refs=tuple(szyny),
                zasilajacy=zasilajacy,
                tolerancja=tolerancja,
                powod=powod,
            )
        )
    return wynik


def tolerancje_wezlow_nn(enm: EnergyNetworkModel) -> dict[str, TolerancjaNapieciaNn | None]:
    """Tolerancja sieci nN per szyna nN (``ref_id``); szyny spoza pasma nN nie występują."""
    return {ref: wyspa.tolerancja for wyspa in wyspy_nn(enm) for ref in wyspa.bus_refs}


def dobierz_c_wezla(
    wezel: Node, scenario: Scenario, nadpisanie: NadpisanieC | None = None
) -> DoborC:
    """c punktu zwarcia z tolerancją sieci nN WĘZŁA — ``voltage_factor.dobierz_c`` (jedyna
    reguła), z odmową braku tolerancji, która nazywa szynę z modelu.

    Partia integracji 11: bieg kanoniczny zwarć, wiązanie zwarcia ze stanem modelu i koperta
    wejścia solvera dobierały c każdy własnym wywołaniem, a odmowa braku tolerancji wychodziła
    zdaniem rdzenia bez nazwy szyny. Jedno miejsce dla trzech konsumentów; zdanie wg wzorca
    odmów rdzenia (``enm.zdania_odmow_rdzenia``): treść i „Dotyczy: <nazwa>." — nazwa nadana
    albo polski opis rodzaju, nigdy identyfikator.
    """
    try:
        return dobierz_c(
            wezel.voltage_level, scenario, nadpisanie, tolerancja_nn=wezel.tolerancja_nn
        )
    except OdmowaToleranciiNnError as odmowa:
        nazwa = nazwa_nadana(wezel.name) or NAZWA_ELEMENTU_BEZ_NAZWY["buses"]
        raise odmowa.dotyczy(nazwa) from odmowa
