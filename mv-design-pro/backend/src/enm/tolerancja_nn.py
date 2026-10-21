"""Tolerancja napięcia sieci nN — JEDEN predykat per węzeł (karty WSPOLCZYNNIK-C-JEDEN-NOSNIK
i TOLERANCJA-NN-WARTOSC-ROBOCZA).

Tabela 1 IEC 60909-0 rozróżnia sieci nN o tolerancji +6 % (c 1,05/0,95) i +10 %
(c 1,10/0,90). Tolerancja jest daną SIECI nN, a sieć nN w modelu to wyspa galwaniczna
szyn w paśmie nN (połączonych gałęziami, których oba końce leżą w paśmie nN — transformator
oddziela wyspę). Nośnikiem deklaracji jest element ZASILAJĄCY wyspę — ten, który definiuje
napięcie sieci nN:

- transformator, którego strona dolna (pasmo nN) leży na szynie wyspy
  (``Transformer.lv_voltage_tolerance``, wzorzec ``lv_earthing_system``); K_T tego samego
  transformatora (IEC 60909-0 eq. 12a) czyta c_max strony dolnej z klasy WYSPY — wejście
  (c węzła nN) i wyjście (K_T) mają jedno źródło;
- źródło sieciowe (równoważnik sieci zasilającej) przyłączone wprost do szyny wyspy
  (``Source.lv_voltage_tolerance``) — sieć nN zasilana bez transformatora w modelu; Z_Q tego
  źródła (eq. 6) czyta c z klasy wyspy przez węzeł przyłączenia.

Pierwszeństwo rozstrzyga rejestr wartości roboczych
(``network_model.catalog.wartosci_robocze.rozstrzygnij_tolerancje_nn``): deklaracja projektanta
> wartość robocza. Zasada nr 4 (V12K-351): brak deklaracji, deklaracje sprzeczne albo wyspa bez
elementu zasilającego NIE blokują zwarć — wyspa dostaje wartość roboczą (klasa +10 %,
zachowawcza w obu kierunkach), bieg niesie założenie ``fault.c_tolerancja_nn_robocza``
wymieniające wyspę, podstawa c każdego jej węzła mówi „wartość robocza", a werdykty liczone z
jej prądów zwarciowych niosą daną przyjętą (``ESTIMATED``). Mapper grafu, pętla zwarcia,
dowody i założenia biegu czytają WYŁĄCZNIE ten moduł.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from network_model.catalog.wartosci_robocze import (
    PARAMETR_TOLERANCJA_NN,
    PochodzenieTolerancjiNn,
    PowodPropozycjiTolerancjiNn,
    TolerancjaNnRozstrzygnieta,
    rozstrzygnij_tolerancje_nn,
)
from network_model.core.node import Node
from network_model.core.voltage_factor import (
    ETYKIETA_TOLERANCJI_NN,
    DoborC,
    NadpisanieC,
    Scenario,
    TolerancjaNapieciaNn,
    dobierz_c,
)
from network_model.pochodne.pasma_napieciowe import w_pasmie_nn

from .models import EnergyNetworkModel
from .nazwy_elementow import nazwa_elementu

#: Kod założenia biegu: wyspa nN liczona z wartością roboczą tolerancji (rejestr gotowości,
#: poziom informacyjny — nie blokuje, nazywa wyspę i drogę zmiany).
KOD_TOLERANCJA_NN_ROBOCZA = "fault.c_tolerancja_nn_robocza"

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
    """Wyspa galwaniczna szyn nN z deklaracjami jej elementów zasilających i klasą
    tolerancji rozstrzygniętą przez rejestr wartości roboczych (zawsze ustaloną)."""

    bus_refs: tuple[str, ...]
    #: Elementy zasilające: transformatory (kolejność modelu), potem źródła (kolejność modelu).
    zasilajacy: tuple[ZasilajacyNn, ...]
    rozstrzygniecie: TolerancjaNnRozstrzygnieta

    @property
    def tolerancja(self) -> TolerancjaNapieciaNn:
        """Klasa tolerancji sieci nN, z którą liczone jest c węzłów wyspy."""
        return self.rozstrzygniecie.wartosc

    @property
    def pochodzenie(self) -> PochodzenieTolerancjiNn:
        return self.rozstrzygniecie.pochodzenie

    @property
    def robocza(self) -> bool:
        """Klasa jest wartością roboczą rejestru (nie deklaracją projektanta)."""
        return self.rozstrzygniecie.robocza

    @property
    def powod(self) -> PowodPropozycjiTolerancjiNn | None:
        """Dlaczego wyspa dostała wartość roboczą (``None`` przy deklaracji)."""
        return self.rozstrzygniecie.powod_propozycji

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
        wynik.append(
            WyspaNn(
                bus_refs=tuple(szyny),
                zasilajacy=zasilajacy,
                rozstrzygniecie=rozstrzygnij_tolerancje_nn(tuple(z.tolerancja for z in zasilajacy)),
            )
        )
    return wynik


def wyspy_wezlow_nn(enm: EnergyNetworkModel) -> dict[str, WyspaNn]:
    """Wyspa nN każdej szyny nN (``ref_id``); szyny spoza pasma nN nie występują.

    Jedno źródło dla klasy tolerancji i jej pochodzenia — konsument czyta oba z tej samej
    wyspy (predykaty parami), nigdy z dwóch niezależnych przejść.
    """
    return {ref: wyspa for wyspa in wyspy_nn(enm) for ref in wyspa.bus_refs}


def tolerancje_wezlow_nn(enm: EnergyNetworkModel) -> dict[str, TolerancjaNapieciaNn]:
    """Klasa tolerancji sieci nN per szyna nN (``ref_id``); szyny spoza pasma nN nie występują."""
    return {ref: wyspa.tolerancja for ref, wyspa in wyspy_wezlow_nn(enm).items()}


def dobierz_c_wezla(
    wezel: Node, scenario: Scenario, nadpisanie: NadpisanieC | None = None
) -> DoborC:
    """c punktu zwarcia z klasą tolerancji sieci nN WĘZŁA — ``voltage_factor.dobierz_c``
    (jedyna reguła); wartość robocza klasy jest nazwana w podstawie c.

    Partia integracji 11: bieg kanoniczny zwarć, wiązanie zwarcia ze stanem modelu i koperta
    wejścia solvera dobierały c każdy własnym wywołaniem. Jedno miejsce dla trzech konsumentów.
    """
    return dobierz_c(
        wezel.voltage_level,
        scenario,
        nadpisanie,
        tolerancja_nn=wezel.tolerancja_nn,
        tolerancja_nn_robocza=wezel.tolerancja_nn_robocza,
    )


def _nazwy_zasilajacych(enm: EnergyNetworkModel, wyspa: WyspaNn) -> list[str]:
    kolekcje: dict[str, dict[str, Any]] = {
        "transformers": {t.ref_id: t for t in enm.transformers},
        "sources": {s.ref_id: s for s in enm.sources},
    }
    opisy: list[str] = []
    for z in wyspa.zasilajacy:
        rodzaj = "transformator" if z.rodzaj == "transformers" else "źródło"
        nazwa = nazwa_elementu(kolekcje[z.rodzaj][z.ref_id], z.rodzaj)
        deklaracja = (
            f"deklaruje {ETYKIETA_TOLERANCJI_NN[z.tolerancja]}"
            if z.tolerancja is not None
            else "bez deklaracji"
        )
        opisy.append(f"{rodzaj} {nazwa} ({deklaracja})")
    return opisy


def zalozenia_tolerancji_nn(
    enm: EnergyNetworkModel, scenario: Scenario
) -> tuple[dict[str, Any], ...]:
    """Założenia biegu zwarciowego: jedno na KAŻDĄ wyspę nN z wartością roboczą tolerancji.

    Wzorzec założeń biegu (``source.sk_min_missing``, ``fault.czas_tb_brak``): kod, element,
    zdanie, scenariusz. Element = pierwszy element zasilający wyspę (tam projektant zmienia
    wartość — ``parametr`` wskazuje pole), a przy wyspie bez elementu zasilającego — jej
    pierwsza szyna (bez ``parametr``: deklaracji nie ma na czym położyć). Kolejność wysp jak
    ``wyspy_nn`` (deterministycznie). Wyspa z deklaracją nie daje założenia — bieg na samych
    deklaracjach ma tę samą listę założeń co przed kartą.
    """
    szyny = {b.ref_id: b for b in enm.buses}
    zalozenia: list[dict[str, Any]] = []
    for wyspa in wyspy_nn(enm):
        if not wyspa.robocza:
            continue
        nazwy_szyn = ", ".join(nazwa_elementu(szyny[ref], "buses") for ref in wyspa.bus_refs)
        zasilajacy = _nazwy_zasilajacych(enm, wyspa)
        opis_zasilania = (
            "; zasilanie: " + ", ".join(zasilajacy)
            if zasilajacy
            else "; brak elementu zasilającego"
        )
        zmiana = (
            "Zmień wartość: tolerancja napięcia sieci nN na elemencie zasilającym."
            if wyspa.zasilajacy
            else "Deklarację tolerancji przyjmuje transformator albo źródło zasilające sieć nN."
        )
        wpis: dict[str, Any] = {
            "code": KOD_TOLERANCJA_NN_ROBOCZA,
            "element_ref": (wyspa.zasilajacy[0].ref_id if wyspa.zasilajacy else wyspa.bus_refs[0]),
            "message_pl": (
                f"Sieć nN (szyny: {nazwy_szyn}{opis_zasilania}): "
                f"{wyspa.rozstrzygniecie.opis_zrodla_pl()} Ta sama wartość robocza wyznacza "
                f"c_max we wzorze K_T transformatora i K_G maszyny tej sieci. {zmiana}"
            ),
            "scenariusz": scenario,
        }
        if wyspa.zasilajacy:
            wpis["parametr"] = PARAMETR_TOLERANCJA_NN
            wpis["element_type"] = (
                "Transformer" if wyspa.zasilajacy[0].rodzaj == "transformers" else "Source"
            )
        zalozenia.append(wpis)
    return tuple(zalozenia)
