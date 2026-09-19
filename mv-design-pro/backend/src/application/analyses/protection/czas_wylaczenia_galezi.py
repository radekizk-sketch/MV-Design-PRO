"""Czas wylaczenia zwarcia PER GALAZ z realnej mapy zabezpieczen (karta F-K1 faza 5).

ZNALEZISKO Z1 (rozszerzenie). Kryterium cieplne przewodu
(``wytrzymalosc_cieplna_przewodow``) liczy sie z czasem trwania zwarcia ``t_k``.
Do tej pory bralo ``ShortCircuitResult.tk_s`` — JEDNA wartosc dla calej sieci,
bedaca ZALOZONYM czasem obliczeniowym przypadku, a NIE rozwiazana nastawa
zabezpieczenia danej galezi. Werdykt cieplny opierał sie wiec na parametrze
przypadku, choc wyglądał jak wynik z modelu.

CO ROBI TEN MODUL: dla kazdej galezi znajduje aparat, ktory ja chroni, i liczy
czas jego zadzialania PRZY PRADZIE TEJ GALEZI. Wynik karmi opcjonalny parametr
``tk_s_by_branch`` analizy cieplnej.

WARSTWA ANALIZ, NIE SOLVER: zaden wzor fizyczny nie powstaje tutaj. Czas liczy
istniejacy solver ``protection_iec60255.compute_curve_trip_time`` (IEC 60255),
prad galezi pochodzi z rozbicia wkladow zwarciowych solvera SC, a nastawy z
modelu (``protection_assignments``). Ten modul WYLACZNIE laczy te trzy zrodla i
nazywa, czego brakuje.

ZERO FABRYKACJI — regula nadrzedna tego modulu:
galaz, dla ktorej nie da sie wskazac aparatu albo odczytac nastaw, dostaje
``tk_s = None``, czyli JAWNY BRAK CZASU (analiza cieplna zglasza wtedy kod
``conductor.fault_duration_missing``). NIGDY nie podstawiamy wspolnego
``sc_result.tk_s`` — zalozony czas przypadku udawalby wtedy rozwiazana nastawe
zabezpieczenia, a to jest dokladnie ten defekt, ktory ta karta usuwa.

DETERMINIZM: przejscie grafu odwiedza sasiadow w kolejnosci posortowanej po
identyfikatorze, wiec dla tego samego modelu wynik jest identyczny.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from application.analyses.prad_zwarciowy_galezi import (
    prad_zwarciowy_galezi as _prad_galezi,
)
from enm.mapping import ref_to_graph_id
from enm.models import EnergyNetworkModel
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.switch import SwitchState, SwitchType
from network_model.core.topologia import przeglad_wszerz_od
from network_model.solvers.protection_iec60255 import (
    IEC60255_CURVE_PARAMS,
    IEC60255CurveType,
    compute_curve_trip_time,
)
from network_model.solvers.short_circuit_iec60909 import ShortCircuitResult

# ---------------------------------------------------------------------------
# Zrodla czasu — jawny slownik stanow, zeby „brak” nie byl pustym polem
# ---------------------------------------------------------------------------

ZRODLO_NASTAWA = "nastawa_zabezpieczenia"
ZRODLO_BRAK_APARATU = "brak_aparatu_chroniacego"
ZRODLO_BRAK_NASTAW = "brak_nastaw_aparatu"
ZRODLO_BRAK_PRADU = "brak_pradu_galezi"
ZRODLO_PONIZEJ_ROZRUCHU = "prad_ponizej_rozruchu"

# Czas NIE pochodzi z nastawy, tylko z parametru przypadku obliczeniowego
# (``ShortCircuitResult.tk_s``). To wartosc ZALOZONA przez projektanta — legalna
# podstawa oceny, ale musi byc nazwana wprost, zeby nikt nie odczytal jej jako
# rozwiazanej nastawy zabezpieczenia.
ZRODLO_ZALOZENIE_PRZYPADKU = "zalozenie_przypadku"

# Aparaty, ktore PRZERYWAJA prad zwarciowy. Rozlacznik i odlacznik nie wylaczaja
# zwarcia, wiec nie moga wyznaczac czasu trwania zwarcia dla kryterium cieplnego.
_APARATY_WYLACZAJACE = frozenset({SwitchType.BREAKER, SwitchType.RECLOSER})

# Funkcje nadpradowe zwarciowe: tylko one wyznaczaja czas wylaczenia zwarcia
# miedzyfazowego. Funkcje ziemnozwarciowe i napieciowe/czestotliwosciowe nie
# odpowiadaja za prad zwarcia trojfazowego uzyty w kryterium cieplnym.
_FUNKCJE_ZWARCIOWE = ("overcurrent_50", "overcurrent_51")

# Odwzorowanie krzywej z modelu ENM na typ solvera. Dopasowanie idzie PO WZORZE
# (parze stalych A, B z IEC 60255-151 tab. 1), a NIE po nazwie — nazewnictwo obu
# stron sie rozjezdza i dopasowanie „po podobnej nazwie” podstawiloby inna
# charakterystyke, czyli inny czas wylaczenia:
#   IEC_SI (standard inverse) -> NI = (0,14; 0,02)  — ta sama krzywa, inna nazwa
#   IEC_VI                    -> VI = (13,5; 1)
#   IEC_EI                    -> EI = (80; 2)
#   IEC_LI (long-time inverse)-> RI = (120; 1)      — solver nazywa ja „RI", ale
#                                stale sa dlugozwloczne; zgodnosc sprawdza test.
_KRZYWE = {
    "DT": IEC60255CurveType.DT,
    "IEC_SI": IEC60255CurveType.NI,
    "IEC_VI": IEC60255CurveType.VI,
    "IEC_EI": IEC60255CurveType.EI,
    "IEC_LI": IEC60255CurveType.RI,
}


@dataclass(frozen=True)
class CzasWylaczeniaGalezi:
    """Czas wylaczenia dla jednej galezi + PELNY slad, skad sie wzial.

    ``tk_s is None`` znaczy brak danych (a nie zero) — ``zrodlo`` i ``powod_pl``
    mowia, ktorego ogniwa zabraklo.
    """

    branch_id: str
    tk_s: float | None
    zrodlo: str
    powod_pl: str
    urzadzenie_ref: str | None = None
    urzadzenie_nazwa: str | None = None
    funkcja: str | None = None
    prad_galezi_a: float | None = None
    prad_rozruchowy_a: float | None = None
    krzywa: str | None = None
    tms: float | None = None
    # Stale charakterystyki (A, B) z IEC 60255-151 tab. 1 UZYTE w rachunku — bez
    # nich dowod pokazywalby nazwe krzywej zamiast podstawienia liczbowego.
    # ``None`` dla charakterystyki niezaleznej (DT nie ma tych stalych).
    stala_a: float | None = None
    stala_b: float | None = None

    @property
    def z_nastawy(self) -> bool:
        """Czy czas pochodzi z rozwiazanej nastawy (a nie z zalozenia przypadku)."""
        return self.zrodlo == ZRODLO_NASTAWA

    def to_dict(self) -> dict[str, Any]:
        return {
            "branch_id": self.branch_id,
            "tk_s": self.tk_s,
            "zrodlo": self.zrodlo,
            "powod_pl": self.powod_pl,
            "urzadzenie_ref": self.urzadzenie_ref,
            "urzadzenie_nazwa": self.urzadzenie_nazwa,
            "funkcja": self.funkcja,
            "prad_galezi_a": self.prad_galezi_a,
            "prad_rozruchowy_a": self.prad_rozruchowy_a,
            "krzywa": self.krzywa,
            "tms": self.tms,
            "stala_a": self.stala_a,
            "stala_b": self.stala_b,
        }


# ---------------------------------------------------------------------------
# Topologia: ktory aparat chroni dana galaz
# ---------------------------------------------------------------------------


def _wezly_zrodlowe(graph: NetworkGraph) -> list[str]:
    """Wezly, w ktorych zasilanie wchodzi do sieci (posortowane — determinizm)."""
    wezly: set[str] = set()
    for zrodlo in graph.get_grid_sc_sources():
        wezly.add(zrodlo.node_id)
    for zrodlo in graph.get_synchronous_machine_sources():
        wezly.add(zrodlo.node_id)
    for zrodlo in graph.get_asynchronous_machine_sources():
        wezly.add(zrodlo.node_id)
    for zrodlo in graph.get_inverter_sources():
        wezly.add(zrodlo.node_id)
    return sorted(wezly)


def _sasiedztwo(graph: NetworkGraph) -> dict[str, list[tuple[str, str, str]]]:
    """Mapa wezel -> lista (sasiad, rodzaj, id_elementu); rodzaj: „galaz" albo „lacznik".

    Uwzglednia WYLACZNIE elementy przewodzace: galezie w sluzbie oraz laczniki
    ZAMKNIETE. Otwarty lacznik nie przewodzi, wiec nie tworzy drogi zwarcia — droga
    przez niego bylaby fikcyjna.
    """
    mapa: dict[str, list[tuple[str, str, str]]] = {}

    def dodaj(a: str, b: str, rodzaj: str, ident: str) -> None:
        mapa.setdefault(a, []).append((b, rodzaj, ident))

    for branch_id in sorted(graph.branches):
        branch = graph.branches[branch_id]
        if not getattr(branch, "in_service", True):
            continue
        dodaj(branch.from_node_id, branch.to_node_id, "galaz", branch_id)
        dodaj(branch.to_node_id, branch.from_node_id, "galaz", branch_id)

    for switch_id in sorted(graph.switches):
        switch = graph.switches[switch_id]
        if switch.state != SwitchState.CLOSED:
            continue
        if not getattr(switch, "in_service", True):
            continue
        dodaj(switch.from_node_id, switch.to_node_id, "lacznik", switch_id)
        dodaj(switch.to_node_id, switch.from_node_id, "lacznik", switch_id)

    for wezel in mapa:
        mapa[wezel].sort()
    return mapa


def znajdz_aparat_chroniacy(graph: NetworkGraph, branch_id: str) -> str | None:
    """Identyfikator aparatu wylaczajacego, ktory chroni dana galaz.

    REGULA: idziemy od wezlow zrodlowych w glab sieci (przejscie wszerz, kolejnosc
    sasiadow posortowana — determinizm) i szukamy drogi konczacej sie ta galezia.
    Aparatem chroniacym jest OSTATNI wylacznik/recloser napotkany na tej drodze,
    czyli ten polozony najblizej galezi od strony zasilania — bo to on wylaczy
    zwarcie jako pierwszy.

    Zwraca ``None``, gdy na drodze od zasilania do galezi nie ma zadnego aparatu
    wylaczajacego (albo galaz jest nieosiagalna) — brak danych, nie domysl.
    """
    sasiedztwo = _sasiedztwo(graph)
    start = _wezly_zrodlowe(graph)
    if not start:
        return None

    # Stan przegladu: (wezel, id ostatniego napotkanego aparatu wylaczajacego) — ten
    # sam wezel osiagniety „zza” innego aparatu to inny stan ochrony. Przeglad
    # wszerz po stanach prowadzi jedyne jadro topologii
    # (``network_model.core.topologia.przeglad_wszerz``, CV-4.3); kolejnosc odkrycia
    # stanow jest ta sama co dawnej kolejki, wiec pierwszy stan, z ktorego widac
    # szukana galaz z niepustym aparatem, jest ten sam.
    Stan = tuple[str, str | None]

    def _nastepne(stan: Stan) -> list[tuple[None, Stan]]:
        wezel, ostatni_aparat = stan
        wynik: list[tuple[None, Stan]] = []
        for sasiad, rodzaj, ident in sasiedztwo.get(wezel, []):
            if rodzaj == "galaz" and ident == branch_id:
                continue
            nowy_aparat = ostatni_aparat
            if rodzaj == "lacznik":
                switch = graph.switches[ident]
                if switch.switch_type in _APARATY_WYLACZAJACE:
                    nowy_aparat = ident
            wynik.append((None, (sasiad, nowy_aparat)))
        return wynik

    kolejnosc = przeglad_wszerz_od([(w, None) for w in start], _nastepne)
    for wezel, ostatni_aparat in kolejnosc:
        if ostatni_aparat is None:
            continue
        if any(
            rodzaj == "galaz" and ident == branch_id
            for _sasiad, rodzaj, ident in sasiedztwo.get(wezel, [])
        ):
            return ostatni_aparat
    return None


# ---------------------------------------------------------------------------
# Nastawy -> czas zadzialania
# ---------------------------------------------------------------------------


def _przypisanie_dla_aparatu(
    protection_assignments: list[dict[str, Any]], breaker_ref: str
) -> dict[str, Any] | None:
    """Wpis ``protection_assignments`` dla wskazanego wylacznika (albo ``None``)."""
    for wpis in protection_assignments:
        if wpis.get("breaker_ref") != breaker_ref:
            continue
        if wpis.get("is_enabled") is False:
            # Zabezpieczenie wylaczone z ruchu nie wyznacza czasu wylaczenia.
            continue
        return wpis
    return None


def nastawa_zwarciowa(wpis: dict[str, Any]) -> dict[str, Any] | None:
    """Nastawa funkcji nadpradowej zwarciowej o NAJNIZSZYM progu rozruchowym.

    NAZWA PUBLICZNA od karty KD-6: tego samego wyboru nastawy uzywa czas
    wylaczenia POLA stacji (`czas_wylaczenia_pola`). Druga implementacja wyboru
    stopnia rozjechalaby sie z ta przy pierwszej zmianie regul.

    Przy kilku stopniach (50 i 51) zwarcie wylacza ten, ktory zadziala — wybor
    najnizszego progu jest zachowawczy i nie wymaga zgadywania logiki blokad.
    """
    kandydaci: list[dict[str, Any]] = []
    for nastawa in wpis.get("settings") or []:
        if nastawa.get("function_type") not in _FUNKCJE_ZWARCIOWE:
            continue
        prog = nastawa.get("threshold_a")
        if prog is None or float(prog) <= 0.0:
            continue
        kandydaci.append(nastawa)
    if not kandydaci:
        return None
    return min(kandydaci, key=lambda n: (float(n["threshold_a"]), str(n.get("function_type"))))


def czas_z_nastawy(
    nastawa: dict[str, Any], prad_a: float
) -> tuple[float | None, str | None, str, tuple[float, float] | None]:
    """(czas, powod_braku, opis_krzywej, stale (A, B)) dla nastawy i pradu galezi.

    Czas liczy solver IEC 60255 — tutaj nie ma zadnego wzoru. Stale krzywej sa
    zwracane po to, zeby dowod mogl pokazac PODSTAWIENIE LICZBOWE, a nie sama
    nazwe charakterystyki (dla DT stalych nie ma — ``None``).
    """
    prog = float(nastawa["threshold_a"])
    if prad_a <= prog:
        # Krotnosc M = I/Is musi PRZEKROCZYC 1, zeby zabezpieczenie zadzialalo
        # (IEC 60255-151: dla M <= 1 czas nie jest zdefiniowany). Ten sam prog ma
        # solver — brak wyzwolenia zwraca tam ``calculated_time_s = None``.
        return None, ZRODLO_PONIZEJ_ROZRUCHU, str(nastawa.get("curve_type") or "DT"), None

    krzywa_txt = str(nastawa.get("curve_type") or "DT")
    krzywa = _KRZYWE.get(krzywa_txt)
    if krzywa is None:
        return None, ZRODLO_BRAK_NASTAW, krzywa_txt, None

    if krzywa is IEC60255CurveType.DT:
        # Charakterystyka niezalezna: czas to wprost zwloka nastawiona.
        zwloka = nastawa.get("time_delay_s")
        if zwloka is None:
            return None, ZRODLO_BRAK_NASTAW, krzywa_txt, None
        wynik = compute_curve_trip_time(
            curve_type=krzywa, i_fault_a=prad_a, is_pickup_a=prog, tms=float(zwloka)
        )
        return wynik.calculated_time_s, None, krzywa_txt, None

    tms = nastawa.get("time_multiplier")
    if tms is None or float(tms) <= 0.0:
        return None, ZRODLO_BRAK_NASTAW, krzywa_txt, None
    wynik = compute_curve_trip_time(
        curve_type=krzywa, i_fault_a=prad_a, is_pickup_a=prog, tms=float(tms)
    )
    if wynik.calculated_time_s is None:
        # Solver nie wyznaczyl czasu (brak wyzwolenia) — nie zgadujemy wartosci.
        return None, ZRODLO_PONIZEJ_ROZRUCHU, krzywa_txt, None
    return wynik.calculated_time_s, None, krzywa_txt, IEC60255_CURVE_PARAMS[krzywa]


# ---------------------------------------------------------------------------
# Wejscie publiczne
# ---------------------------------------------------------------------------


def wyznacz_czasy_wylaczenia(
    *,
    graph: NetworkGraph,
    sc_result: ShortCircuitResult,
    protection_assignments: list[dict[str, Any]] | None,
) -> dict[str, CzasWylaczeniaGalezi]:
    """Czas wylaczenia per galaz (linie i kable) wraz ze sladem pochodzenia.

    Args:
        graph: graf sieci (galezie, laczniki, zrodla).
        sc_result: wynik biegu zwarciowego (zrodlo pradu galezi).
        protection_assignments: wpisy ``protection_assignments`` modelu ENM.
            ``None`` albo pusta lista znaczy brak mapy zabezpieczen — wszystkie
            galezie dostana wtedy jawny brak czasu.

    Returns:
        Mapa branch_id -> ``CzasWylaczeniaGalezi``, posortowana po branch_id
        (determinizm).
    """
    przypisania = list(protection_assignments or [])
    wynik: dict[str, CzasWylaczeniaGalezi] = {}

    for branch_id in sorted(graph.branches):
        branch = graph.branches[branch_id]
        if not isinstance(branch, LineBranch):
            continue
        if branch.branch_type not in (BranchType.LINE, BranchType.CABLE):
            continue

        prad = _prad_galezi(sc_result, branch_id)
        if prad is None:
            wynik[branch_id] = CzasWylaczeniaGalezi(
                branch_id=branch_id,
                tk_s=None,
                zrodlo=ZRODLO_BRAK_PRADU,
                powod_pl=(
                    "Bieg zwarciowy nie policzył rozbicia prądu na gałęzie, więc nie ma "
                    "przy jakim prądzie sprawdzić charakterystyki zabezpieczenia."
                ),
            )
            continue

        aparat_id = znajdz_aparat_chroniacy(graph, branch_id)
        if aparat_id is None:
            wynik[branch_id] = CzasWylaczeniaGalezi(
                branch_id=branch_id,
                tk_s=None,
                zrodlo=ZRODLO_BRAK_APARATU,
                powod_pl=(
                    "Na drodze od zasilania do tej gałęzi nie ma wyłącznika ani reclosera, "
                    "więc żaden aparat nie wyznacza czasu trwania zwarcia."
                ),
                prad_galezi_a=prad,
            )
            continue

        aparat = graph.switches[aparat_id]
        wpis = _przypisanie_dla_aparatu(przypisania, aparat_id)
        if wpis is None:
            wynik[branch_id] = CzasWylaczeniaGalezi(
                branch_id=branch_id,
                tk_s=None,
                zrodlo=ZRODLO_BRAK_NASTAW,
                powod_pl=(
                    f"Aparat {aparat.name or aparat_id} nie ma przypisanego czynnego "
                    "zabezpieczenia, więc czas zadziałania jest niewyznaczalny."
                ),
                urzadzenie_ref=aparat_id,
                urzadzenie_nazwa=aparat.name,
                prad_galezi_a=prad,
            )
            continue

        nastawa = nastawa_zwarciowa(wpis)
        if nastawa is None:
            wynik[branch_id] = CzasWylaczeniaGalezi(
                branch_id=branch_id,
                tk_s=None,
                zrodlo=ZRODLO_BRAK_NASTAW,
                powod_pl=(
                    f"Zabezpieczenie {wpis.get('name') or wpis.get('ref_id')} nie ma nastawy "
                    "funkcji nadprądowej zwarciowej (50/51) z progiem rozruchowym."
                ),
                urzadzenie_ref=aparat_id,
                urzadzenie_nazwa=aparat.name,
                prad_galezi_a=prad,
            )
            continue

        czas, powod_braku, krzywa_txt, stale = czas_z_nastawy(nastawa, prad)
        prog = float(nastawa["threshold_a"])
        funkcja = str(nastawa.get("function_type"))
        if czas is None:
            powody = {
                ZRODLO_PONIZEJ_ROZRUCHU: (
                    f"Prąd gałęzi {prad:.1f} A nie przekracza progu rozruchowego {prog:g} A "
                    f"funkcji {funkcja}, więc to zabezpieczenie nie zadziała."
                ),
                ZRODLO_BRAK_NASTAW: (
                    f"Nastawa funkcji {funkcja} jest niekompletna (brak zwłoki albo mnożnika "
                    f"czasowego dla charakterystyki {krzywa_txt})."
                ),
            }
            wynik[branch_id] = CzasWylaczeniaGalezi(
                branch_id=branch_id,
                tk_s=None,
                zrodlo=powod_braku or ZRODLO_BRAK_NASTAW,
                powod_pl=powody.get(powod_braku or "", "Czas zadziałania niewyznaczalny."),
                urzadzenie_ref=aparat_id,
                urzadzenie_nazwa=aparat.name,
                funkcja=funkcja,
                prad_galezi_a=prad,
                prad_rozruchowy_a=prog,
                krzywa=krzywa_txt,
                tms=nastawa.get("time_multiplier"),
            )
            continue

        wynik[branch_id] = CzasWylaczeniaGalezi(
            branch_id=branch_id,
            tk_s=czas,
            zrodlo=ZRODLO_NASTAWA,
            powod_pl=(
                f"Czas z charakterystyki {krzywa_txt} zabezpieczenia "
                f"{wpis.get('name') or wpis.get('ref_id')} przy prądzie gałęzi {prad:.1f} A."
            ),
            urzadzenie_ref=aparat_id,
            urzadzenie_nazwa=aparat.name,
            funkcja=funkcja,
            prad_galezi_a=prad,
            prad_rozruchowy_a=prog,
            krzywa=krzywa_txt,
            tms=nastawa.get("time_multiplier"),
            stala_a=stale[0] if stale else None,
            stala_b=stale[1] if stale else None,
        )

    return wynik


def czasy_dla_modelu(
    *,
    model: EnergyNetworkModel,
    graph: NetworkGraph,
    sc_result: ShortCircuitResult,
) -> dict[str, CzasWylaczeniaGalezi]:
    """Czasy wylaczenia dla modelu ENM zmapowanego na graf.

    Wpisy ``protection_assignments`` odwoluja sie do wylacznika przez ``ref_id``
    modelu, a graf zna elementy pod identyfikatorem wyliczonym z tego ``ref_id``
    (``enm.mapping.ref_to_graph_id``). Bez tego przelozenia zaden aparat nie
    zostalby dopasowany i KAZDA galaz raportowalaby brak nastaw — czyli defekt
    wygladajacy jak brak danych projektanta.
    """
    przypisania: list[dict[str, Any]] = []
    for wpis in model.protection_assignments:
        dane = wpis.model_dump()
        dane["breaker_ref"] = ref_to_graph_id(str(wpis.breaker_ref))
        przypisania.append(dane)
    return wyznacz_czasy_wylaczenia(
        graph=graph, sc_result=sc_result, protection_assignments=przypisania
    )


def mapa_tk_s_z_nastaw(czasy: dict[str, CzasWylaczeniaGalezi]) -> dict[str, float]:
    """Czasy WYZNACZONE Z NASTAW — tylko one nadpisuja czas przypadku.

    Galaz bez rozwiazanej nastawy jest w mapie NIEOBECNA: analiza cieplna uzyje dla
    niej zalozonego czasu przypadku, a ``slad_czasu`` nazwie to wprost. Wpisanie tu
    ``None`` odbieraloby projektantowi ocene, ktora ma prawo zrobic na wlasnym
    zalozeniu normowym.
    """
    return {
        branch_id: czas.tk_s for branch_id, czas in sorted(czasy.items()) if czas.tk_s is not None
    }


def slad_czasu(
    czasy: dict[str, CzasWylaczeniaGalezi], *, tk_s_zalozony: float
) -> dict[str, dict[str, Any]]:
    """Pochodzenie czasu dla KAZDEJ galezi — nastawa albo jawne zalozenie przypadku.

    KLUCZOWY NIEZMIENNIK KARTY: zadna galaz nie moze pokazac czasu bez podania,
    skad on jest. Czas z nastawy i czas zalozony przypadku wygladaja w tabeli tak
    samo, wiec to ``zrodlo`` odroznia rozwiazana ochrone od zalozenia projektanta.
    """
    wynik: dict[str, dict[str, Any]] = {}
    for branch_id, czas in sorted(czasy.items()):
        if czas.tk_s is not None:
            wynik[branch_id] = czas.to_dict()
            continue
        pozycja = czas.to_dict()
        pozycja["tk_s"] = tk_s_zalozony
        pozycja["zrodlo"] = ZRODLO_ZALOZENIE_PRZYPADKU
        pozycja["powod_pl"] = (
            f"{czas.powod_pl} Przyjęto założony czas przypadku obliczeniowego "
            f"{tk_s_zalozony:g} s."
        )
        wynik[branch_id] = pozycja
    return wynik


def podsumowanie_czasow(slad: dict[str, dict[str, Any]]) -> dict[str, int]:
    """Ile galezi ma czas z nastawy, a ile z zalozenia przypadku (jawna proporcja)."""
    z_nastawy = sum(1 for poz in slad.values() if poz.get("zrodlo") == ZRODLO_NASTAWA)
    return {
        "z_nastawy": z_nastawy,
        "z_zalozenia": len(slad) - z_nastawy,
        "razem": len(slad),
    }
